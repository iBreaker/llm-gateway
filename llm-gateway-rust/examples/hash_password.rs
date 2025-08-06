use llm_gateway_rust::auth::password;

fn main() {
    let password = "4YXDzDeKQe8@260!";
    match password::hash_password(password) {
        Ok(hash) => {
            println!("Password: {}", password);
            println!("Hash: {}", hash);
            
            // 验证哈希
            match password::verify_password(password, &hash) {
                Ok(valid) => println!("Verification: {}", valid),
                Err(e) => println!("Verification error: {}", e),
            }
        }
        Err(e) => println!("Error: {}", e),
    }
}