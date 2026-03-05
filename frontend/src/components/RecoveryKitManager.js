import React, { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';

const RecoveryKitManager = ({ encryptionPassword, pgpPrivateKey, userId, username }) => {
  const [recoveryKitStatus, setRecoveryKitStatus] = useState({
    lastBackupAt: null,
    daysSinceBackup: 0,
    isCurrent: false,
    recommendedAction: 'none',
    promptForBackup: true
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showKit, setShowKit] = useState(false);
  const [generatedKit, setGeneratedKit] = useState(null);
  const [copiedSection, setCopiedSection] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await authAPI.getRecoveryKitStatus();
      setRecoveryKitStatus(data);
    } catch (error) {
      console.error('Failed to fetch recovery kit status:', error);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const generateRecoveryKit = async () => {
    if (!encryptionPassword || !pgpPrivateKey) {
      toast.error('Encryption password and PGP private key required to generate recovery kit');
      return;
    }

    setIsGenerating(true);
    try {
      // Generate a unique kit ID
      const kitId = `RK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      // Create timestamp
      const generatedAt = new Date().toISOString();
      
      // Build recovery kit payload (client-side only, never sent to server)
      const recoveryKit = {
        kitId,
        userId,
        username,
        generatedAt,
        version: 1,
        // Critical: These are encrypted client-side before storage
        credentials: {
          encryptionPassword,
          pgpPrivateKey
        },
        // Instructions for recovery
        instructions: {
          title: 'SocialSecure Recovery Kit',
          description: 'This kit contains your encrypted credentials needed to recover access to your encrypted messages and data.',
          warning: 'Keep this kit secure. Anyone with access to this kit and your account password can decrypt your messages.',
          steps: [
            'Store this file in a secure location (password manager, encrypted USB, or printed in a safe)',
            'Do not store this unencrypted on cloud services',
            'To recover: Import this kit in Settings > Security > Recovery Kit',
            'You will need your account password to decrypt this kit'
          ]
        }
      };

      // Encrypt the kit using a derived key from encryptionPassword
      // In production, this would use proper encryption like AES-GCM
      const encryptedKit = await encryptRecoveryKit(recoveryKit, encryptionPassword);
      
      setGeneratedKit({
        ...recoveryKit,
        encryptedData: encryptedKit
      });
      
      // Save metadata to server (NOT the kit itself)
      await authAPI.saveRecoveryKitMetadata({
        lastGeneratedAt: generatedAt,
        kitVersion: 1
      });
      
      await fetchStatus();
      setShowKit(true);
      toast.success('Recovery kit generated successfully!');
    } catch (error) {
      console.error('Failed to generate recovery kit:', error);
      toast.error('Failed to generate recovery kit');
    } finally {
      setIsGenerating(false);
    }
  };

  // Simple encryption for demo - in production use Web Crypto API properly
  const encryptRecoveryKit = async (kit, password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(kit));
    
    // Use SubtleCrypto for actual encryption
    const passwordKey = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      passwordKey,
      data
    );
    
    // Combine IV + encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    
    // Base64 encode for storage
    return btoa(String.fromCharCode(...result));
  };

  const deriveKey = async (password) => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('SocialSecureRecoveryKit'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  };

  const downloadKit = () => {
    if (!generatedKit) return;
    
    const kitData = {
      kitId: generatedKit.kitId,
      userId: generatedKit.userId,
      username: generatedKit.username,
      generatedAt: generatedKit.generatedAt,
      version: generatedKit.version,
      encryptedData: generatedKit.encryptedData,
      instructions: generatedKit.instructions
    };
    
    const blob = new Blob([JSON.stringify(kitData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `socialsecure-recovery-kit-${username}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Recovery kit downloaded');
  };

  const copyToClipboard = (text, section) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
    toast.success('Copied to clipboard');
  };

  const getStatusColor = () => {
    if (!recoveryKitStatus.lastBackupAt) return 'red';
    if (!recoveryKitStatus.isCurrent) return 'yellow';
    return 'green';
  };

  const getStatusMessage = () => {
    if (!recoveryKitStatus.lastBackupAt) {
      return 'No backup created yet. Create your recovery kit now to protect your encrypted data.';
    }
    if (!recoveryKitStatus.isCurrent) {
      return `Last backup was ${recoveryKitStatus.daysSinceBackup} days ago. Consider creating a new recovery kit.`;
    }
    return 'Your recovery kit is up to date.';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Recovery Kit</h2>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          getStatusColor() === 'red' ? 'bg-red-100 text-red-800' :
          getStatusColor() === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
          'bg-green-100 text-green-800'
        }`}>
          {!recoveryKitStatus.lastBackupAt ? 'Not Backed Up' :
           !recoveryKitStatus.isCurrent ? 'Needs Update' : 'Up to Date'}
        </div>
      </div>

      <p className="text-gray-600 mb-4">{getStatusMessage()}</p>

      {recoveryKitStatus.lastBackupAt && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Last Backup:</span>
              <p className="font-medium text-gray-900">
                {new Date(recoveryKitStatus.lastBackupAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Days Since Backup:</span>
              <p className="font-medium text-gray-900">{recoveryKitStatus.daysSinceBackup}</p>
            </div>
          </div>
        </div>
      )}

      {!showKit ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">What is a Recovery Kit?</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Contains your encrypted credentials (encryption password & PGP private key)</li>
              <li>Required to recover access to your encrypted messages if you lose your device</li>
              <li>Stored encrypted - only you can decrypt it with your account password</li>
              <li>Never uploaded to our servers - stays on your device</li>
            </ul>
          </div>

          <button
            onClick={generateRecoveryKit}
            disabled={isGenerating || !encryptionPassword || !pgpPrivateKey}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </span>
            ) : (
              'Generate Recovery Kit'
            )}
          </button>

          {(!encryptionPassword || !pgpPrivateKey) && (
            <p className="text-sm text-amber-600 text-center">
              Set up encryption password and PGP keys in Security settings first
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-900 mb-2">✓ Recovery Kit Generated</h3>
            <p className="text-sm text-green-800">
              Your recovery kit has been created. Download it now and store it securely.
            </p>
          </div>

          {generatedKit && (
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 text-sm">Kit Preview (JSON)</span>
                <button
                  onClick={() => copyToClipboard(JSON.stringify({
                    kitId: generatedKit.kitId,
                    userId: generatedKit.userId,
                    username: generatedKit.username,
                    generatedAt: generatedKit.generatedAt,
                    version: generatedKit.version,
                    encryptedData: generatedKit.encryptedData?.substring(0, 100) + '...'
                  }, null, 2), 'preview')}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  {copiedSection === 'preview' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="text-green-400 text-xs font-mono">
{`{
  "kitId": "${generatedKit.kitId}",
  "userId": "${generatedKit.userId}",
  "username": "${generatedKit.username}",
  "generatedAt": "${generatedKit.generatedAt}",
  "version": ${generatedKit.version},
  "encryptedData": "${generatedKit.encryptedData?.substring(0, 50)}..."
}`}
              </pre>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={downloadKit}
              className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Download Kit
            </button>
            <button
              onClick={() => {
                setShowKit(false);
                setGeneratedKit(null);
              }}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Generate New
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="font-medium text-amber-900 mb-2">⚠️ Security Warning</h3>
            <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
              <li>Store this kit in a secure location (password manager, encrypted USB)</li>
              <li>Do not store unencrypted on cloud services</li>
              <li>Anyone with this kit and your account password can decrypt your messages</li>
              <li>We cannot recover your data if you lose this kit</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecoveryKitManager;
