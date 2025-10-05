const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Configure Gmail transporter (ili bilo koji drugi email service)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com', // Tvoj Gmail
    pass: 'your-app-password'     // Gmail App Password (ne obična lozinka!)
  }
});

/**
 * Send Welcome Email
 * @param {string} userEmail - User's email address
 * @param {string} userName - User's name
 */
async function sendWelcomeEmail(userEmail, userName) {
  const emailTemplate = fs.readFileSync(
    path.join(__dirname, 'email-templates/welcome-email.html'),
    'utf-8'
  );

  const personalizedEmail = emailTemplate.replace('{{userName}}', userName);

  const mailOptions = {
    from: '"Pumpaj Video Downloader" <noreply@pumpajvideodl.com>',
    to: userEmail,
    subject: 'Dobrodošli na Pumpaj! 🎉',
    html: personalizedEmail
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    throw error;
  }
}

/**
 * Send Verification Email
 * @param {string} userEmail - User's email address
 * @param {string} verificationLink - Verification URL
 * @param {string} verificationCode - 6-digit verification code
 */
async function sendVerificationEmail(userEmail, verificationLink, verificationCode) {
  const emailTemplate = fs.readFileSync(
    path.join(__dirname, 'email-templates/verification-email.html'),
    'utf-8'
  );

  const personalizedEmail = emailTemplate
    .replace('{{verificationLink}}', verificationLink)
    .replace('{{verificationCode}}', verificationCode);

  const mailOptions = {
    from: '"Pumpaj Video Downloader" <noreply@pumpajvideodl.com>',
    to: userEmail,
    subject: 'Verifikujte vaš email - Pumpaj',
    html: personalizedEmail
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw error;
  }
}

// Test funkcija
async function testEmail() {
  console.log('🧪 Testing email sending...\n');

  // Test Welcome Email
  console.log('📧 Sending welcome email...');
  await sendWelcomeEmail('test@example.com', 'Zoran');

  // Test Verification Email
  console.log('\n📧 Sending verification email...');
  await sendVerificationEmail(
    'test@example.com',
    'https://pumpajvideodl.com/verify?token=abc123',
    '123456'
  );

  console.log('\n✅ All emails sent successfully!');
}

// Ako se pokrene direktno (node send-email.js)
if (require.main === module) {
  testEmail().catch(console.error);
}

module.exports = {
  sendWelcomeEmail,
  sendVerificationEmail
};
