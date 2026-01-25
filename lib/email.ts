/**
 * Brevo Email Integration
 * Transactional emails for order confirmations, shipping updates, etc.
 * 
 * Documentation: https://developers.brevo.com/
 * 
 * SETUP REQUIRED:
 * 1. Sign up at https://www.brevo.com (free tier available)
 * 2. Go to SMTP & API > API Keys
 * 3. Create or copy your API key
 * 4. Add BREVO_API_KEY to your environment variables
 */

const BREVO_API_URL = 'https://api.brevo.com/v3';

interface EmailRecipient {
  email: string;
  name?: string;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

interface OrderEmailData {
  orderId: string;
  email: string;
  customerName: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  shippingAddress: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

/**
 * Get authorization header for Brevo API
 */
function getAuthHeader(): Record<string, string> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured');
  }
  return {
    'api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

/**
 * Send a transactional email
 */
export async function sendEmail(params: {
  to: EmailRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  sender?: EmailRecipient;
  replyTo?: EmailRecipient;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.warn('Brevo not configured, skipping email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const response = await fetch(`${BREVO_API_URL}/smtp/email`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        sender: params.sender || {
          name: process.env.NEXT_PUBLIC_APP_NAME || 'Modest Ummah',
          email: 'orders@modestummah.com',
        },
        to: params.to,
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
        replyTo: params.replyTo,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, messageId: data.messageId };
  } catch (error: any) {
    console.error('Brevo email error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmation(order: OrderEmailData): Promise<{ success: boolean; error?: string }> {
  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;">` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #8B7355;">
        <h1 style="color: #8B7355; margin: 0; font-size: 28px;">Modest Ummah</h1>
        <p style="color: #666; margin: 10px 0 0 0;">Order Confirmation</p>
      </div>

      <div style="padding: 30px 0;">
        <p>Assalamu Alaikum ${order.customerName},</p>
        
        <p>Thank you for your order! We're preparing your items with care and will notify you when they ship.</p>
        
        <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">Order #${order.orderId}</h2>
        </div>

        <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px;">Order Summary</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f8f8;">
              <th style="padding: 12px; text-align: left; width: 70px;"></th>
              <th style="padding: 12px; text-align: left;">Item</th>
              <th style="padding: 12px; text-align: center;">Qty</th>
              <th style="padding: 12px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="margin-top: 20px; text-align: right;">
          <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${order.subtotal.toFixed(2)}</p>
          <p style="margin: 5px 0;"><strong>Shipping:</strong> $${order.shipping.toFixed(2)}</p>
          <p style="margin: 5px 0;"><strong>Tax:</strong> $${order.tax.toFixed(2)}</p>
          <p style="margin: 15px 0 0 0; font-size: 20px; color: #8B7355;"><strong>Total:</strong> $${order.total.toFixed(2)}</p>
        </div>

        <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 30px;">Shipping Address</h3>
        <p style="margin: 0;">
          ${order.shippingAddress.street1}<br>
          ${order.shippingAddress.street2 ? order.shippingAddress.street2 + '<br>' : ''}
          ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zip}<br>
          ${order.shippingAddress.country}
        </p>
      </div>

      <div style="border-top: 1px solid #eee; padding: 20px 0; text-align: center; color: #666; font-size: 14px;">
        <p>Questions? Reply to this email or contact us at support@modestummah.com</p>
        <p style="margin-top: 20px;">
          <a href="https://modestummah.com" style="color: #8B7355; text-decoration: none;">modestummah.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: [{ email: order.email, name: order.customerName }],
    subject: `Order Confirmed - #${order.orderId}`,
    htmlContent,
  });
}

/**
 * Send shipping notification email
 */
export async function sendShippingNotification(params: {
  email: string;
  customerName: string;
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: string;
}): Promise<{ success: boolean; error?: string }> {
  const trackingUrl = params.carrier.toLowerCase().includes('usps')
    ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${params.trackingNumber}`
    : params.carrier.toLowerCase().includes('ups')
    ? `https://www.ups.com/track?tracknum=${params.trackingNumber}`
    : params.carrier.toLowerCase().includes('fedex')
    ? `https://www.fedex.com/fedextrack/?trknbr=${params.trackingNumber}`
    : '#';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #8B7355;">
        <h1 style="color: #8B7355; margin: 0; font-size: 28px;">Modest Ummah</h1>
        <p style="color: #666; margin: 10px 0 0 0;">Your Order Has Shipped! 📦</p>
      </div>

      <div style="padding: 30px 0;">
        <p>Assalamu Alaikum ${params.customerName},</p>
        
        <p>Great news! Your order <strong>#${params.orderId}</strong> is on its way!</p>
        
        <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; color: #666;">Tracking Number</p>
          <p style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">${params.trackingNumber}</p>
          <p style="margin: 10px 0 0 0; color: #666;">via ${params.carrier}</p>
          ${params.estimatedDelivery ? `<p style="margin: 10px 0 0 0; color: #8B7355;">Estimated delivery: ${params.estimatedDelivery}</p>` : ''}
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingUrl}" style="display: inline-block; background: #8B7355; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Track Your Package</a>
        </div>
      </div>

      <div style="border-top: 1px solid #eee; padding: 20px 0; text-align: center; color: #666; font-size: 14px;">
        <p>Questions? Reply to this email or contact us at support@modestummah.com</p>
        <p style="margin-top: 20px;">
          <a href="https://modestummah.com" style="color: #8B7355; text-decoration: none;">modestummah.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: [{ email: params.email, name: params.customerName }],
    subject: `Your order #${params.orderId} has shipped!`,
    htmlContent,
  });
}

/**
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(params: {
  email: string;
  name: string;
}): Promise<{ success: boolean; error?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #8B7355;">
        <h1 style="color: #8B7355; margin: 0; font-size: 28px;">Modest Ummah</h1>
      </div>

      <div style="padding: 30px 0;">
        <h2 style="text-align: center; color: #333;">Welcome to the Family! 🌙</h2>
        
        <p>Assalamu Alaikum ${params.name},</p>
        
        <p>Welcome to Modest Ummah! We're thrilled to have you join our community of believers who value modesty, quality, and style.</p>
        
        <p>Here's what you can look forward to:</p>
        
        <ul style="color: #555;">
          <li>Carefully curated modest fashion for the whole family</li>
          <li>High-quality materials and craftsmanship</li>
          <li>Fast, reliable shipping</li>
          <li>Exclusive offers for our members</li>
        </ul>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://modestummah.com/shop" style="display: inline-block; background: #8B7355; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Start Shopping</a>
        </div>
      </div>

      <div style="border-top: 1px solid #eee; padding: 20px 0; text-align: center; color: #666; font-size: 14px;">
        <p style="margin-top: 20px;">
          <a href="https://modestummah.com" style="color: #8B7355; text-decoration: none;">modestummah.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: [{ email: params.email, name: params.name }],
    subject: 'Welcome to Modest Ummah! 🌙',
    htmlContent,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(params: {
  email: string;
  name: string;
  resetLink: string;
}): Promise<{ success: boolean; error?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #8B7355;">
        <h1 style="color: #8B7355; margin: 0; font-size: 28px;">Modest Ummah</h1>
      </div>

      <div style="padding: 30px 0;">
        <h2 style="text-align: center; color: #333;">Reset Your Password</h2>
        
        <p>Assalamu Alaikum ${params.name},</p>
        
        <p>We received a request to reset your password. Click the button below to create a new password:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${params.resetLink}" style="display: inline-block; background: #8B7355; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
        </div>
        
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.</p>
      </div>

      <div style="border-top: 1px solid #eee; padding: 20px 0; text-align: center; color: #666; font-size: 14px;">
        <p style="margin-top: 20px;">
          <a href="https://modestummah.com" style="color: #8B7355; text-decoration: none;">modestummah.com</a>
        </p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: [{ email: params.email, name: params.name }],
    subject: 'Reset Your Password - Modest Ummah',
    htmlContent,
  });
}
