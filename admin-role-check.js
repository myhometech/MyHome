
const { db } = require('./server/db');
const { users } = require('./shared/schema');
const { eq } = require('drizzle-orm');

async function checkAndSetAdminRole() {
  try {
    console.log('🔧 Checking admin roles...');
    
    // Find your user by email
    const userEmail = 'simon@myhome-tech.com'; // Replace with your email
    
    const user = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
    
    if (user.length === 0) {
      console.log('❌ User not found:', userEmail);
      return;
    }
    
    console.log('👤 Current user role:', user[0].role);
    
    if (user[0].role !== 'admin') {
      console.log('🔧 Setting admin role...');
      
      await db.update(users)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(eq(users.id, user[0].id));
      
      console.log('✅ Admin role set successfully');
    } else {
      console.log('✅ User already has admin role');
    }
    
    // List all admin users
    const adminUsers = await db.select().from(users).where(eq(users.role, 'admin'));
    console.log('👑 Admin users:', adminUsers.map(u => u.email));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAndSetAdminRole();
