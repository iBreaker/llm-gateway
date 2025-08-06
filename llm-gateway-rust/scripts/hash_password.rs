use bcrypt::{hash, DEFAULT_COST};

fn main() {
    let passwords = vec!["test123", "admin123"];
    
    for password in passwords {
        match hash(password, DEFAULT_COST) {
            Ok(hashed) => {
                println!("Password: {} -> Hash: {}", password, hashed);
            }
            Err(e) => {
                eprintln!("Error hashing {}: {:?}", password, e);
            }
        }
    }
}