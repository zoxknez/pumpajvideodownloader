# 📧 Email Templates za Pumpaj Video Downloader

## 📂 Struktura

```
email-templates/
├── welcome-email.html          # Welcome email sa logom
├── verification-email.html     # Email verifikacija
└── README.md                   # Ova dokumentacija
```

---

## 🎨 1. Welcome Email Template

**Fajl:** `welcome-email.html`

### Kako da ubacim Pumpaj logo?

**Trenutno logo URL:**
```html
<img src="https://pumpajvideodl.com/pumpaj-192.png" alt="Pumpaj Logo" class="logo">
```

### Opcije za logo:

#### **Option 1: Koristi postojeći logo sa production sajta** ✅ (PREPORUČENO)
```html
<img src="https://pumpajvideodl.com/pumpaj-192.png" alt="Pumpaj Logo">
```
- ✅ Radi odmah
- ✅ Nema dodatne konfiguracije
- ✅ Logo je već online

#### **Option 2: Host logo na CDN-u** (imgbb, Cloudinary, etc.)
1. Idi na: https://imgbb.com/ (besplatno)
2. Upload `public/pumpaj-192.png`
3. Kopiraj Direct Link
4. Zameni URL u email template-u

#### **Option 3: Embed kao Base64** (za offline emails)
```html
<img src="data:image/png;base64,iVBORw0KGgoAAAANS..." alt="Pumpaj Logo">
```
- ✅ Radi offline
- ❌ Veliki file size
- ❌ Spam filteri mogu da blokuju

#### **Option 4: Supabase Storage** (integrisano rešenje)
1. Upload logo u Supabase Storage
2. Dobij public URL
3. Koristi u email template-u

---

## 📨 Kako da pošaljem email?

### Option 1: Nodemailer (Node.js backend)

**Install:**
```bash
npm install nodemailer
```

**Kod:**
```javascript
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Read email template
const emailTemplate = fs.readFileSync(
  path.join(__dirname, 'email-templates/welcome-email.html'),
  'utf-8'
);

// Configure transporter (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password' // Use App Password, not regular password!
  }
});

// Send email
async function sendWelcomeEmail(userEmail, userName) {
  const mailOptions = {
    from: '"Pumpaj Video Downloader" <noreply@pumpajvideodl.com>',
    to: userEmail,
    subject: 'Dobrodošli na Pumpaj! 🎉',
    html: emailTemplate.replace('{{userName}}', userName)
  };

  await transporter.sendMail(mailOptions);
}

// Usage
sendWelcomeEmail('user@example.com', 'Zoran');
```

---

### Option 2: Supabase Edge Functions (Serverless)

**Create edge function:**
```bash
supabase functions new send-welcome-email
```

**Function code:**
```typescript
// supabase/functions/send-welcome-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  const { email, name } = await req.json();

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <!-- Your email template here -->
    </html>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Pumpaj <noreply@pumpajvideodl.com>',
      to: email,
      subject: 'Dobrodošli na Pumpaj! 🎉',
      html: emailHtml,
    }),
  });

  return new Response(JSON.stringify({ sent: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

### Option 3: Resend (Modern Email API) ✅ PREPORUČENO

**Install:**
```bash
npm install resend
```

**Kod:**
```javascript
const { Resend } = require('resend');
const fs = require('fs');

const resend = new Resend('re_123456789'); // Your API key

const emailTemplate = fs.readFileSync('./email-templates/welcome-email.html', 'utf-8');

async function sendWelcomeEmail(userEmail, userName) {
  await resend.emails.send({
    from: 'Pumpaj <noreply@pumpajvideodl.com>',
    to: userEmail,
    subject: 'Dobrodošli na Pumpaj! 🎉',
    html: emailTemplate.replace('{{userName}}', userName)
  });
}
```

**Setup:**
1. Registruj se na: https://resend.com (besplatno 100 emails/dan)
2. Dodaj domain `pumpajvideodl.com` i verifikuj DNS
3. Kopiraj API key
4. Koristi u kodu

---

## 🔧 Integracija sa Supabase Auth

**Automatic welcome email na registraciju:**

```javascript
// web/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Listen to auth events
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    // Send welcome email
    await fetch('/api/send-welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: session.user.email,
        name: session.user.user_metadata.full_name || 'User'
      })
    });
  }
});
```

**API Route:**
```typescript
// web/app/api/send-welcome-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import fs from 'fs';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const { email, name } = await request.json();

  const emailTemplate = fs.readFileSync(
    './email-templates/welcome-email.html',
    'utf-8'
  );

  await resend.emails.send({
    from: 'Pumpaj <noreply@pumpajvideodl.com>',
    to: email,
    subject: 'Dobrodošli na Pumpaj! 🎉',
    html: emailTemplate.replace('{{userName}}', name)
  });

  return NextResponse.json({ sent: true });
}
```

---

## 📝 Email Template Personalizacija

Dodaj placeholders u HTML:

```html
<h2 class="greeting">Zdravo, {{userName}}! 🎉</h2>
<p>Tvoj email: {{userEmail}}</p>
```

Zameni u kodu:

```javascript
const personalizedEmail = emailTemplate
  .replace('{{userName}}', userName)
  .replace('{{userEmail}}', userEmail);
```

---

## 🎨 Kako da izmenim logo u email-u?

### Trenutno logo:
```html
<img src="https://pumpajvideodl.com/pumpaj-192.png" alt="Pumpaj Logo" class="logo">
```

### Ako želiš drugi logo:

**Option 1: Upload na Supabase Storage**
```bash
# Upload logo
supabase storage create-bucket email-assets --public
supabase storage upload email-assets/logo.png public/pumpaj-192.png
```

Dobij URL:
```
https://smzxjnuqfvpzfzmyxpbp.supabase.co/storage/v1/object/public/email-assets/logo.png
```

**Option 2: Koristi imgbb**
1. Idi na: https://imgbb.com
2. Upload `public/pumpaj-192.png`
3. Kopiraj Direct Link
4. Zameni u email template-u

---

## 🚀 Quick Start

### 1. Kopiraj logo na public location:
```bash
# Logo je već na: https://pumpajvideodl.com/pumpaj-192.png
# Proveri da radi:
curl -I https://pumpajvideodl.com/pumpaj-192.png
```

### 2. Test email lokalno:
```javascript
// test-email.js
const fs = require('fs');

const emailTemplate = fs.readFileSync('./email-templates/welcome-email.html', 'utf-8');
console.log('Email template loaded!');

// Open in browser
fs.writeFileSync('./test-email-preview.html', emailTemplate);
console.log('Preview: ./test-email-preview.html');
```

Run:
```bash
node test-email.js
# Otvori test-email-preview.html u browser-u
```

### 3. Send test email:
```bash
npm install nodemailer
node send-test-email.js
```

---

## 📧 Email Services - Pricing

| Service | Free Tier | Preporučeno za |
|---------|-----------|----------------|
| **Resend** | 100/dan | Production ✅ |
| **Gmail** | 500/dan | Testing |
| **SendGrid** | 100/dan | Production |
| **Mailgun** | 100/dan | Production |
| **AWS SES** | 62,000/mesec | Enterprise |

---

## ✅ Next Steps

1. ✅ Logo je već dostupan na: `https://pumpajvideodl.com/pumpaj-192.png`
2. ⏭️ Izaberi email service (Resend preporučujem)
3. ⏭️ Integriši sa Supabase auth events
4. ⏭️ Test send
5. ⏭️ Deploy to production

---

## 🔗 Useful Links

- 📖 [Nodemailer Docs](https://nodemailer.com)
- 📖 [Resend Docs](https://resend.com/docs)
- 📖 [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- 🎨 [Email Template Testing](https://putsmail.com/)

---

**Email template je spreman! Logo je već online! Samo izaberi email service i integriši! 🚀**
