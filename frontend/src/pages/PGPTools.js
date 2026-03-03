import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  generatePGPKeyPair,
  encryptMessage,
  decryptMessage,
  storePrivateKeyLocal,
  getPrivateKeyLocal
} from '../utils/pgp';

function PGPTools() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [plainText, setPlainText] = useState('');
  const [encryptedText, setEncryptedText] = useState('');
  const [decryptedText, setDecryptedText] = useState('');

  const handleGenerate = async () => {
    try {
      const { privateKey, publicKey: pub } = await generatePGPKeyPair(name, email, passphrase);
      setPublicKey(pub);
      storePrivateKeyLocal('local-user', privateKey);
      toast.success('PGP keys generated locally');
    } catch (error) {
      toast.error('Failed to generate keys');
    }
  };

  const handleEncrypt = async () => {
    try {
      const encrypted = await encryptMessage(plainText, publicKey);
      setEncryptedText(encrypted);
      toast.success('Message encrypted');
    } catch {
      toast.error('Encryption failed');
    }
  };

  const handleDecrypt = async () => {
    try {
      const privateKey = getPrivateKeyLocal('local-user');
      const decrypted = await decryptMessage(encryptedText, privateKey, passphrase);
      setDecryptedText(decrypted);
      toast.success('Message decrypted');
    } catch {
      toast.error('Decryption failed');
    }
  };

  return (
    <div className="p-6 bg-white rounded shadow space-y-4">
      <h2 className="text-xl font-semibold">PGP Tools (Client-side only)</h2>
      <p className="text-sm text-gray-600">Private key is stored only in browser local storage for this demo.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input className="border p-2 rounded" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="border p-2 rounded" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="border p-2 rounded" type="password" placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
      </div>

      <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={handleGenerate}>Generate Key Pair</button>

      <textarea className="w-full border p-2 rounded" rows="5" placeholder="Public key" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} />
      <textarea className="w-full border p-2 rounded" rows="4" placeholder="Message to encrypt" value={plainText} onChange={(e) => setPlainText(e.target.value)} />

      <div className="space-x-2">
        <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={handleEncrypt}>Encrypt</button>
        <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={handleDecrypt}>Decrypt</button>
      </div>

      <textarea className="w-full border p-2 rounded" rows="5" placeholder="Encrypted message" value={encryptedText} onChange={(e) => setEncryptedText(e.target.value)} />
      <textarea className="w-full border p-2 rounded" rows="3" placeholder="Decrypted output" value={decryptedText} readOnly />
    </div>
  );
}

export default PGPTools;
