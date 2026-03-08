const VAULT_PREFIX = 'socialsecure.e2ee.v1';
const KDF_ITERATIONS = 310000;
const AES_NONCE_BYTES = 12;
const ROOM_KEY_BYTES = 32;
const MAX_PLAINTEXT_CACHE = 200;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const ensureWebCrypto = () => {
  if (!window?.crypto?.subtle) {
    throw new Error('WebCrypto is required for end-to-end encryption features.');
  }
};

const toBase64 = (bytes) => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const toBase64Url = (bytes) => toBase64(bytes)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const normalizeBase64 = (value) => {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding === 0) return normalized;
  return `${normalized}${'='.repeat(4 - padding)}`;
};

const fromBase64 = (value) => {
  const binary = atob(normalizeBase64(value));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toHex = (bytes) => [...bytes]
  .map((value) => value.toString(16).padStart(2, '0'))
  .join('');

const randomBytes = (length) => {
  const out = new Uint8Array(length);
  window.crypto.getRandomValues(out);
  return out;
};

const getVaultStorageKey = (userId) => `${VAULT_PREFIX}:${userId}`;

const buildDeviceId = () => {
  if (window.crypto.randomUUID) return `web-${window.crypto.randomUUID()}`;
  return `web-${Date.now()}-${toHex(randomBytes(8))}`;
};

const importPBKDF2Password = async (password) => {
  return window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
};

const deriveVaultKey = async ({ password, salt, iterations }) => {
  const passwordKey = await importPBKDF2Password(password);
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
};

const hashBase64 = async (inputBytes) => {
  const digest = await window.crypto.subtle.digest('SHA-256', inputBytes);
  return toBase64(new Uint8Array(digest));
};

const hashHex = async (inputBytes) => {
  const digest = await window.crypto.subtle.digest('SHA-256', inputBytes);
  return toHex(new Uint8Array(digest));
};

const encryptAesGcm = async ({ key, plaintextBytes, aad, encoding = 'base64' }) => {
  const nonce = randomBytes(AES_NONCE_BYTES);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: encoder.encode(aad)
    },
    key,
    plaintextBytes
  );

  const encode = encoding === 'base64url' ? toBase64Url : toBase64;

  return {
    nonce: encode(nonce),
    ciphertext: encode(new Uint8Array(ciphertext))
  };
};

const decryptAesGcm = async ({ key, nonceB64, ciphertextB64, aad }) => {
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(nonceB64),
      additionalData: encoder.encode(aad)
    },
    key,
    fromBase64(ciphertextB64)
  );
  return new Uint8Array(plaintext);
};

const serializeRoomKeys = (roomKeysMap) => {
  const out = {};
  for (const [roomId, versions] of roomKeysMap.entries()) {
    out[roomId] = {};
    for (const [keyVersion, keyBytes] of versions.entries()) {
      out[roomId][keyVersion] = toBase64(keyBytes);
    }
  }
  return out;
};

const deserializeRoomKeys = (rawRoomKeys = {}) => {
  const roomKeys = new Map();
  for (const [roomId, versionMap] of Object.entries(rawRoomKeys)) {
    const versions = new Map();
    for (const [keyVersion, b64Value] of Object.entries(versionMap || {})) {
      if (typeof b64Value !== 'string') continue;
      const numericVersion = Number.parseInt(keyVersion, 10);
      if (!Number.isInteger(numericVersion) || numericVersion < 1) continue;
      versions.set(numericVersion, fromBase64(b64Value));
    }
    if (versions.size > 0) {
      roomKeys.set(roomId, versions);
    }
  }
  return roomKeys;
};

const buildVaultAAD = (userId) => `${VAULT_PREFIX}:aad:${userId}`;

const exportSessionPayload = async ({
  deviceId,
  keyVersion,
  encryptionKeyPair,
  signingKeyPair,
  roomKeys
}) => {
  const encryptionPublicJwk = await window.crypto.subtle.exportKey('jwk', encryptionKeyPair.publicKey);
  const encryptionPrivateJwk = await window.crypto.subtle.exportKey('jwk', encryptionKeyPair.privateKey);
  const signingPublicJwk = await window.crypto.subtle.exportKey('jwk', signingKeyPair.publicKey);
  const signingPrivateJwk = await window.crypto.subtle.exportKey('jwk', signingKeyPair.privateKey);

  return {
    version: 1,
    deviceId,
    keyVersion,
    keys: {
      encryptionPublicJwk,
      encryptionPrivateJwk,
      signingPublicJwk,
      signingPrivateJwk
    },
    roomKeys: serializeRoomKeys(roomKeys),
    updatedAt: new Date().toISOString()
  };
};

const importSessionPayload = async (payload) => {
  const encryptionPublicKey = await window.crypto.subtle.importKey(
    'jwk',
    payload.keys.encryptionPublicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
  const encryptionPrivateKey = await window.crypto.subtle.importKey(
    'jwk',
    payload.keys.encryptionPrivateJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const signingPublicKey = await window.crypto.subtle.importKey(
    'jwk',
    payload.keys.signingPublicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );
  const signingPrivateKey = await window.crypto.subtle.importKey(
    'jwk',
    payload.keys.signingPrivateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );

  return {
    encryptionKeyPair: {
      publicKey: encryptionPublicKey,
      privateKey: encryptionPrivateKey
    },
    signingKeyPair: {
      publicKey: signingPublicKey,
      privateKey: signingPrivateKey
    },
    roomKeys: deserializeRoomKeys(payload.roomKeys)
  };
};

const createSession = ({ userId, vaultRecord, vaultKey, sessionPayload, keyPairs }) => {
  const state = {
    userId,
    vaultRecord,
    vaultKey,
    sessionPayload,
    encryptionKeyPair: keyPairs.encryptionKeyPair,
    signingKeyPair: keyPairs.signingKeyPair,
    roomKeys: keyPairs.roomKeys
  };

  return {
    deviceId: state.sessionPayload.deviceId,
    keyVersion: state.sessionPayload.keyVersion,
    getRegisterPayload: async () => {
      const publicEncryptionKey = await window.crypto.subtle.exportKey('jwk', state.encryptionKeyPair.publicKey);
      const publicSigningKey = await window.crypto.subtle.exportKey('jwk', state.signingKeyPair.publicKey);
      return {
        deviceId: state.sessionPayload.deviceId,
        keyVersion: state.sessionPayload.keyVersion,
        publicEncryptionKey: JSON.stringify(publicEncryptionKey),
        publicSigningKey: JSON.stringify(publicSigningKey),
        algorithms: {
          encryption: 'ECDH-P256',
          signing: 'ECDSA-P256-SHA256'
        }
      };
    },
    getRoomKey: (roomId, keyVersion) => {
      const roomVersions = state.roomKeys.get(roomId);
      if (!roomVersions) return null;
      return roomVersions.get(keyVersion) || null;
    },
    getLatestRoomKey: (roomId) => {
      const roomVersions = state.roomKeys.get(roomId);
      if (!roomVersions || roomVersions.size === 0) return null;
      const versions = [...roomVersions.keys()].sort((a, b) => b - a);
      const latestVersion = versions[0];
      return {
        keyVersion: latestVersion,
        keyBytes: roomVersions.get(latestVersion)
      };
    },
    setRoomKey: (roomId, keyVersion, keyBytes) => {
      if (!state.roomKeys.has(roomId)) {
        state.roomKeys.set(roomId, new Map());
      }
      state.roomKeys.get(roomId).set(keyVersion, keyBytes);
    },
    createRoomKey: () => randomBytes(ROOM_KEY_BYTES),
    signBytes: async (bytes) => {
      const signature = await window.crypto.subtle.sign(
        {
          name: 'ECDSA',
          hash: 'SHA-256'
        },
        state.signingKeyPair.privateKey,
        bytes
      );
      return toBase64Url(new Uint8Array(signature));
    },
    verifyBytes: async (bytes, signatureB64) => {
      const signature = fromBase64(signatureB64);
      return window.crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: 'SHA-256'
        },
        state.signingKeyPair.publicKey,
        signature,
        bytes
      );
    },
    getVaultKey: () => state.vaultKey,
    persist: async () => {
      const payload = await exportSessionPayload({
        deviceId: state.sessionPayload.deviceId,
        keyVersion: state.sessionPayload.keyVersion,
        encryptionKeyPair: state.encryptionKeyPair,
        signingKeyPair: state.signingKeyPair,
        roomKeys: state.roomKeys
      });

      const aad = buildVaultAAD(state.userId);
      const { nonce, ciphertext } = await encryptAesGcm({
        key: state.vaultKey,
        plaintextBytes: encoder.encode(JSON.stringify(payload)),
        aad
      });

      const nextRecord = {
        format: VAULT_PREFIX,
        cryptoVersion: 1,
        kdf: state.vaultRecord.kdf,
        encryption: {
          algorithm: 'AES-256-GCM',
          nonce,
          aad
        },
        ciphertext,
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(getVaultStorageKey(state.userId), JSON.stringify(nextRecord));
      state.vaultRecord = nextRecord;
    }
  };
};

export const unlockOrCreateVault = async ({ userId, password }) => {
  ensureWebCrypto();
  if (!userId || !password) {
    throw new Error('User ID and encryption password are required.');
  }

  const storageKey = getVaultStorageKey(userId);
  const existingRaw = localStorage.getItem(storageKey);

  if (!existingRaw) {
    // Security: per-user random salt, PBKDF2-SHA-256 fallback profile with high iterations.
    const salt = randomBytes(16);
    const vaultKey = await deriveVaultKey({
      password,
      salt,
      iterations: KDF_ITERATIONS
    });

    const encryptionKeyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const signingKeyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    const sessionPayload = {
      version: 1,
      deviceId: buildDeviceId(),
      keyVersion: 1,
      roomKeys: {}
    };

    const vaultRecord = {
      format: VAULT_PREFIX,
      cryptoVersion: 1,
      kdf: {
        version: 1,
        name: 'PBKDF2-SHA-256',
        iterations: KDF_ITERATIONS,
        salt: toBase64(salt)
      }
    };

    const session = createSession({
      userId,
      vaultRecord,
      vaultKey,
      sessionPayload,
      keyPairs: {
        encryptionKeyPair,
        signingKeyPair,
        roomKeys: new Map()
      }
    });

    await session.persist();
    return { session, created: true };
  }

  let vaultRecord;
  try {
    vaultRecord = JSON.parse(existingRaw);
  } catch {
    throw new Error('Encrypted vault format is invalid.');
  }

  const salt = fromBase64(vaultRecord?.kdf?.salt || '');
  const iterations = Number(vaultRecord?.kdf?.iterations || 0);
  if (vaultRecord?.kdf?.name !== 'PBKDF2-SHA-256' || !salt.length || !Number.isInteger(iterations)) {
    throw new Error('Unsupported vault KDF profile.');
  }

  const vaultKey = await deriveVaultKey({ password, salt, iterations });

  try {
    const aad = String(vaultRecord?.encryption?.aad || buildVaultAAD(userId));
    const plaintextBytes = await decryptAesGcm({
      key: vaultKey,
      nonceB64: vaultRecord.encryption.nonce,
      ciphertextB64: vaultRecord.ciphertext,
      aad
    });

    const payload = JSON.parse(decoder.decode(plaintextBytes));
    const keyPairs = await importSessionPayload(payload);

    return {
      session: createSession({
        userId,
        vaultRecord,
        vaultKey,
        sessionPayload: payload,
        keyPairs
      }),
      created: false
    };
  } catch {
    throw new Error('Invalid encryption password or corrupted vault.');
  }
};

export const encryptEnvelope = async ({
  session,
  roomId,
  keyVersion,
  roomKey,
  plaintext
}) => {
  const clientMessageId = buildDeviceId();
  const aadObject = {
    roomId,
    keyVersion,
    senderDeviceId: session.deviceId,
    clientMessageId,
    createdAt: new Date().toISOString()
  };
  const aad = JSON.stringify(aadObject);

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    roomKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const { nonce, ciphertext } = await encryptAesGcm({
    key: aesKey,
    plaintextBytes: encoder.encode(plaintext),
    aad,
    encoding: 'base64url'
  });

  const ciphertextHash = await hashHex(fromBase64(ciphertext));
  const signingInput = encoder.encode(
    [
      'v1',
      session.deviceId,
      clientMessageId,
      keyVersion,
      nonce,
      aad,
      ciphertext,
      ciphertextHash
    ].join('|')
  );
  const signature = await session.signBytes(signingInput);

  return {
    version: 1,
    senderDeviceId: session.deviceId,
    clientMessageId,
    keyVersion,
    nonce,
    aad,
    ciphertext,
    signature,
    ciphertextHash,
    algorithms: {
      cipher: 'AES-256-GCM',
      signature: 'ECDSA-P256-SHA256',
      hash: 'SHA-256'
    }
  };
};

export const decryptEnvelope = async ({ session, roomId, envelope }) => {
  const knownKey = session.getRoomKey(roomId, envelope.keyVersion);
  if (!knownKey) {
    throw new Error('Missing room key for this message version.');
  }

  const computedHash = await hashHex(fromBase64(envelope.ciphertext));
  if (computedHash !== envelope.ciphertextHash) {
    throw new Error('Ciphertext hash mismatch.');
  }

  // Security: verify signatures at least for local sender to detect tampering in transit/storage.
  if (envelope.senderDeviceId === session.deviceId) {
    const signingInput = encoder.encode(
      [
        'v1',
        envelope.senderDeviceId,
        envelope.clientMessageId,
        envelope.keyVersion,
        envelope.nonce,
        envelope.aad || '',
        envelope.ciphertext,
        envelope.ciphertextHash
      ].join('|')
    );
    const verified = await session.verifyBytes(signingInput, envelope.signature);
    if (!verified) {
      throw new Error('Signature verification failed.');
    }
  }

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    knownKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const plaintextBytes = await decryptAesGcm({
    key: aesKey,
    nonceB64: envelope.nonce,
    ciphertextB64: envelope.ciphertext,
    aad: envelope.aad || ''
  });

  return decoder.decode(plaintextBytes);
};

export const createWrappedRoomKeyPackage = async ({
  session,
  roomId,
  keyVersion,
  roomKey,
  recipientUserId,
  recipientDeviceId
}) => {
  const wrapAad = JSON.stringify({
    roomId,
    keyVersion,
    recipientUserId,
    recipientDeviceId,
    senderDeviceId: session.deviceId
  });

  const payload = JSON.stringify({
    roomId,
    keyVersion,
    roomKey: toBase64(roomKey)
  });

  const { nonce, ciphertext } = await encryptAesGcm({
    key: session.getVaultKey(),
    plaintextBytes: encoder.encode(payload),
    aad: wrapAad
  });

  const wrappedKeyHash = await hashBase64(fromBase64(ciphertext));
  const signingBytes = encoder.encode(
    [session.deviceId, recipientDeviceId, keyVersion, nonce, wrapAad, ciphertext, wrappedKeyHash].join('|')
  );

  return {
    senderDeviceId: session.deviceId,
    recipientDeviceId,
    recipientUserId,
    keyVersion,
    wrappedRoomKey: ciphertext,
    nonce,
    aad: wrapAad,
    signature: await session.signBytes(signingBytes),
    wrappedKeyHash,
    algorithms: {
      encryption: 'AES-256-GCM',
      wrapping: 'PBKDF2-SHA-256-KEK',
      signing: 'ECDSA-P256-SHA256',
      hash: 'SHA-256'
    }
  };
};

export const ingestWrappedRoomKeyPackage = async ({ session, pkg }) => {
  const computedHash = await hashBase64(fromBase64(pkg.wrappedRoomKey));
  if (pkg.wrappedKeyHash && computedHash !== pkg.wrappedKeyHash) {
    throw new Error('Wrapped key hash mismatch.');
  }

  const plaintextBytes = await decryptAesGcm({
    key: session.getVaultKey(),
    nonceB64: pkg.nonce,
    ciphertextB64: pkg.wrappedRoomKey,
    aad: pkg.aad || ''
  });
  const parsed = JSON.parse(decoder.decode(plaintextBytes));
  if (!parsed.roomId || !parsed.keyVersion || !parsed.roomKey) {
    throw new Error('Wrapped room key payload is invalid.');
  }
  session.setRoomKey(parsed.roomId, parsed.keyVersion, fromBase64(parsed.roomKey));
};

export const setBoundedPlaintextCache = (cacheMap, messageId, value) => {
  cacheMap.set(messageId, value);
  while (cacheMap.size > MAX_PLAINTEXT_CACHE) {
    const oldest = cacheMap.keys().next().value;
    cacheMap.delete(oldest);
  }
};

export const getCacheLimit = () => MAX_PLAINTEXT_CACHE;
