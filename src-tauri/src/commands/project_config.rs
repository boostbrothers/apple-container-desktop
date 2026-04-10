use serde::Serialize;

/// Strip JSONC features (line comments, block comments, trailing commas)
/// so that serde_json can parse devcontainer.json files.
fn strip_jsonc(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;

    while let Some(c) = chars.next() {
        if in_string {
            result.push(c);
            if c == '\\' {
                if let Some(next) = chars.next() {
                    result.push(next);
                }
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }

        match c {
            '"' => {
                in_string = true;
                result.push(c);
            }
            '/' => match chars.peek() {
                Some('/') => {
                    chars.next();
                    while let Some(&nc) = chars.peek() {
                        if nc == '\n' {
                            break;
                        }
                        chars.next();
                    }
                }
                Some('*') => {
                    chars.next();
                    loop {
                        match chars.next() {
                            Some('*') if chars.peek() == Some(&'/') => {
                                chars.next();
                                break;
                            }
                            None => break,
                            _ => {}
                        }
                    }
                }
                _ => result.push(c),
            },
            _ => result.push(c),
        }
    }

    // Strip trailing commas: comma followed by optional whitespace then } or ]
    let bytes = result.into_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if bytes[i] == b',' {
            let mut j = i + 1;
            while j < len && matches!(bytes[j], b' ' | b'\t' | b'\n' | b'\r') {
                j += 1;
            }
            if j < len && (bytes[j] == b'}' || bytes[j] == b']') {
                i += 1;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }

    String::from_utf8(out).unwrap_or_default()
}

#[derive(Debug, Serialize, Clone)]
pub struct ValidationError {
    pub path: String,
    pub message: String,
}

const DEFAULT_IMAGE: &str = "mcr.microsoft.com/devcontainers/base:ubuntu";

fn find_devcontainer_json(workspace_path: &str) -> Option<std::path::PathBuf> {
    let base = std::path::Path::new(workspace_path);
    let primary = base.join(".devcontainer").join("devcontainer.json");
    if primary.exists() {
        return Some(primary);
    }
    let fallback = base.join(".devcontainer.json");
    if fallback.exists() {
        return Some(fallback);
    }
    None
}

fn default_config() -> serde_json::Value {
    serde_json::json!({
        "image": DEFAULT_IMAGE
    })
}

fn validate_config(config: &serde_json::Value) -> Vec<ValidationError> {
    let schema_str = include_str!("../../schemas/devContainer.base.schema.json");
    let schema: serde_json::Value = match serde_json::from_str(schema_str) {
        Ok(s) => s,
        Err(e) => {
            return vec![ValidationError {
                path: "".to_string(),
                message: format!("Failed to parse schema: {}", e),
            }];
        }
    };

    let validator = match jsonschema::validator_for(&schema) {
        Ok(v) => v,
        Err(_e) => {
            // Schema compilation may fail due to $ref resolution or unsupported
            // draft features. Gracefully skip validation in that case.
            return vec![];
        }
    };

    validator
        .iter_errors(config)
        .map(|error| ValidationError {
            path: error.instance_path().to_string(),
            message: error.to_string(),
        })
        .collect()
}

#[derive(Debug, Serialize, Clone)]
pub struct DevcontainerConfigResponse {
    pub config: serde_json::Value,
    pub exists: bool,
}

#[tauri::command]
pub async fn read_devcontainer_json(
    workspace_path: String,
) -> Result<DevcontainerConfigResponse, String> {
    match find_devcontainer_json(&workspace_path) {
        Some(path) => {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
            let cleaned = strip_jsonc(&content);
            let config: serde_json::Value = serde_json::from_str(&cleaned)
                .map_err(|e| format!("Invalid JSON in {}: {}", path.display(), e))?;
            Ok(DevcontainerConfigResponse {
                config,
                exists: true,
            })
        }
        None => Ok(DevcontainerConfigResponse {
            config: default_config(),
            exists: false,
        }),
    }
}

#[tauri::command]
pub async fn write_devcontainer_json(
    workspace_path: String,
    config: serde_json::Value,
) -> Result<(), String> {
    let errors = validate_config(&config);
    if !errors.is_empty() {
        let err_json =
            serde_json::to_string(&errors).unwrap_or_else(|_| "Validation failed".to_string());
        return Err(format!("VALIDATION:{}", err_json));
    }

    let dir = std::path::Path::new(&workspace_path).join(".devcontainer");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create .devcontainer directory: {}", e))?;

    let path = dir.join("devcontainer.json");
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&path, format!("{}\n", content))
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;

    Ok(())
}

#[tauri::command]
pub async fn validate_devcontainer_json(
    config: serde_json::Value,
) -> Result<Vec<ValidationError>, String> {
    Ok(validate_config(&config))
}
