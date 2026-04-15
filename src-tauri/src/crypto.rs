use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;

const NONCE_SIZE: usize = 12;
const KEY_SIZE: usize = 32;

const KEYCHAIN_SERVICE: &str = "apple-container-desktop";
const KEYCHAIN_ACCOUNT: &str = "env-encryption-key";

/// Encrypted value prefix to distinguish from plaintext.
pub const ENCRYPTED_PREFIX: &str = "enc:v1:";

// ─── Key Management ─────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn load_key_from_keychain() -> Option<[u8; KEY_SIZE]> {
    use security_framework::passwords::get_generic_password;
    match get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok(data) => {
            if data.len() == KEY_SIZE {
                let mut key = [0u8; KEY_SIZE];
                key.copy_from_slice(&data);
                Some(key)
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

#[cfg(target_os = "macos")]
fn save_key_to_keychain(key: &[u8; KEY_SIZE]) -> Result<(), String> {
    use security_framework::passwords::{delete_generic_password, set_generic_password};
    // Remove old entry if it exists (ignore errors)
    let _ = delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, key)
        .map_err(|e| format!("Failed to save key to Keychain: {}", e))
}

#[cfg(not(target_os = "macos"))]
fn load_key_from_keychain() -> Option<[u8; KEY_SIZE]> {
    // Fallback: read from a file in config directory
    let key_path = key_file_path().ok()?;
    let data = std::fs::read(&key_path).ok()?;
    if data.len() == KEY_SIZE {
        let mut key = [0u8; KEY_SIZE];
        key.copy_from_slice(&data);
        Some(key)
    } else {
        None
    }
}

#[cfg(not(target_os = "macos"))]
fn save_key_to_keychain(key: &[u8; KEY_SIZE]) -> Result<(), String> {
    let key_path = key_file_path()?;
    std::fs::write(&key_path, key)
        .map_err(|e| format!("Failed to save key file: {}", e))?;
    // Restrict permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set key file permissions: {}", e))?;
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn key_file_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("apple-container-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join(".encryption-key"))
}

fn get_or_create_key() -> Result<[u8; KEY_SIZE], String> {
    if let Some(key) = load_key_from_keychain() {
        return Ok(key);
    }
    // Generate a new random key
    let mut key = [0u8; KEY_SIZE];
    OsRng.fill_bytes(&mut key);
    save_key_to_keychain(&key)?;
    Ok(key)
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────────

/// Encrypt a plaintext string. Returns a string prefixed with `enc:v1:` followed
/// by base64-encoded `nonce || ciphertext`.
pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key = get_or_create_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(format!("{}{}", ENCRYPTED_PREFIX, BASE64.encode(&combined)))
}

/// Decrypt a value previously encrypted by [`encrypt`].
/// If the value doesn't start with `enc:v1:`, returns it as-is (plaintext passthrough
/// for backward compatibility with pre-encryption data).
pub fn decrypt(encrypted: &str) -> Result<String, String> {
    if !encrypted.starts_with(ENCRYPTED_PREFIX) {
        return Ok(encrypted.to_string());
    }

    let encoded = &encrypted[ENCRYPTED_PREFIX.len()..];
    let combined = BASE64
        .decode(encoded)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    if combined.len() < NONCE_SIZE {
        return Err("Invalid encrypted data: too short".to_string());
    }

    let key = get_or_create_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let nonce = Nonce::from_slice(&combined[..NONCE_SIZE]);
    let ciphertext = &combined[NONCE_SIZE..];

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext)
        .map_err(|e| format!("Decrypted data is not valid UTF-8: {}", e))
}

/// Returns true if the value looks like it was encrypted by us.
pub fn is_encrypted(value: &str) -> bool {
    value.starts_with(ENCRYPTED_PREFIX)
}

/// Encrypt a value only if it's not already encrypted.
pub fn ensure_encrypted(value: &str) -> Result<String, String> {
    if is_encrypted(value) {
        Ok(value.to_string())
    } else {
        encrypt(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "super-secret-password-123!@#";
        let encrypted = encrypt(original).unwrap();
        assert!(encrypted.starts_with(ENCRYPTED_PREFIX));
        assert_ne!(encrypted, original);

        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_decrypt_plaintext_passthrough() {
        let plaintext = "not-encrypted-value";
        let result = decrypt(plaintext).unwrap();
        assert_eq!(result, plaintext);
    }

    #[test]
    fn test_is_encrypted() {
        assert!(!is_encrypted("plain-value"));
        let encrypted = encrypt("test").unwrap();
        assert!(is_encrypted(&encrypted));
    }

    #[test]
    fn test_ensure_encrypted_idempotent() {
        let original = "my-secret";
        let first = ensure_encrypted(original).unwrap();
        let second = ensure_encrypted(&first).unwrap();
        // Second call should not double-encrypt
        assert_eq!(first, second);
        // Both should decrypt to original
        assert_eq!(decrypt(&second).unwrap(), original);
    }
}
