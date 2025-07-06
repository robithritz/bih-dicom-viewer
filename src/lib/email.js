import nodemailer from 'nodemailer';

// Create transporter using SMTP configuration from .env
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
    tls: {
      ciphers: 'SSLv3'
    }
  });
};

// Send OTP email
export const sendOTPEmail = async (email, otp, patientId) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
      to: email,
      subject: `${process.env.APP_NAME} - Login Verification Code`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Login Verification Code</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-code { background: #fff; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .otp-number { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0; color: #856404; }
          </style>
        </head>
        <body>
          <div class="container">
          <img src="/images/bih-logo.png" alt="Logo" width="200" height="80">
            <div class="header">
              <h1>${process.env.APP_NAME}</h1>
              <p>Medical Records Access</p>
            </div>
            <div class="content">
              <h2>Login Verification Code</h2>
              <p>Hello,</p>
              <p>You have requested to access your medical records. Please use the verification code below to complete your login:</p>
              
              <div class="otp-code">
                <div class="otp-number">${otp}</div>
                <p><strong>Patient ID:</strong> ${patientId}</p>
              </div>
              
              <div class="warning">
                <strong>Security Notice:</strong>
                <ul>
                  <li>This code will expire in ${Math.floor(process.env.OTP_EXPIRED_TIME_IN_SECOND / 60)} minutes</li>
                  <li>Do not share this code with anyone</li>
                  <li>If you did not request this code, please ignore this email</li>
                </ul>
              </div>
              
              <p>If you have any questions or need assistance, please contact our support team.</p>
              
              <div class="footer">
                <p>This is an automated message from ${process.env.APP_NAME}</p>
                <p>Please do not reply to this email</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        ${process.env.APP_NAME} - Login Verification Code
        
        Hello,
        
        You have requested to access your medical records. Please use the verification code below to complete your login:
        
        Verification Code: ${otp}
        Patient ID: ${patientId}
        
        Security Notice:
        - This code will expire in ${Math.floor(process.env.OTP_EXPIRED_TIME_IN_SECOND / 60)} minutes
        - Do not share this code with anyone
        - If you did not request this code, please ignore this email
        
        If you have any questions or need assistance, please contact our support team.
        
        This is an automated message from ${process.env.APP_NAME}
        Please do not reply to this email
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Test email configuration
export const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    console.error('Email configuration test failed:', error);
    return { success: false, error: error.message };
  }
};
