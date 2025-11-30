// Simple placeholder email utility
const sendEmail = async ({ to, subject, text }) => {
  console.log('--------------------------------');
  console.log('📧 EMAIL SENT');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('Message:', text);
  console.log('--------------------------------');
  return true;
};

module.exports = sendEmail;
