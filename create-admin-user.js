
#!/usr/bin/env node

const { storage } = require('./dist/storage.js');
const { AuthService } = require('./dist/authService.js');

async function createAdminUser() {
  const email = 'admin@example.com';
  const password = 'admin123!';
  
  try {
    console.log('🔧 Creating admin user...');
    
    // Check if admin already exists
    const existingUser = await AuthService.findUserByEmailAndProvider(email, "email");
    if (existingUser) {
      console.log('👤 Admin user already exists, updating role...');
      await storage.updateUser(existingUser.id, { role: 'admin' });
    } else {
      console.log('👤 Creating new admin user...');
      const user = await AuthService.createEmailUser({
        email,
        password,
        firstName: 'Admin',
        lastName: 'User'
      });
      
      await storage.updateUser(user.id, { role: 'admin' });
    }
    
    console.log('✅ Admin user ready!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
