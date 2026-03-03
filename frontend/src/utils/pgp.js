import * as openpgp from 'openpgp';

export const generatePGPKeyPair = async (name, email, passphrase) => {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name, email }],
    passphrase,
    format: 'armored'
  });

  return { privateKey, publicKey };
};

export const encryptMessage = async (plainText, publicKeyArmored) => {
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

  return openpgp.encrypt({
    message: await openpgp.createMessage({ text: plainText }),
    encryptionKeys: publicKey,
    format: 'armored'
  });
};

export const decryptMessage = async (encryptedText, privateKeyArmored, passphrase) => {
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase
  });

  const message = await openpgp.readMessage({ armoredMessage: encryptedText });
  const { data } = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey,
    format: 'utf8'
  });

  return data;
};

export const validatePublicKey = async (publicKeyArmored) => {
  try {
    const key = await openpgp.readKey({ armoredKey: publicKeyArmored });
    return { valid: true, keyId: key.getKeyIDs()[0].toHex() };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

export const storePrivateKeyLocal = (userId, privateKeyArmored) => {
  localStorage.setItem(`pgp_private_${userId}`, privateKeyArmored);
};

export const getPrivateKeyLocal = (userId) => {
  return localStorage.getItem(`pgp_private_${userId}`);
};

export const clearPrivateKeyLocal = (userId) => {
  localStorage.removeItem(`pgp_private_${userId}`);
};

