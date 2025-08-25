## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

Note: You need to generate the .env.local file yourself and fill in the OPENAI_API_KEY (API key) and BASE_URL (OpenAI API URL).

```bash
NEXT_PUBLIC_SUPABASE_URL=https://dcsllovaiiifsvnkaaya.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjc2xsb3ZhaWlpZnN2bmthYXlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0NjMwNzUsImV4cCI6MjA2NTAzOTA3NX0.zjaV5rZo9EuKuLkK6hyOAeN_zyZhk31oB90hSolvgy4
OPENAI_API_KEY=xxx
BASE_URL=xxx
NEXT_PUBLIC_AI_ARCHITECTURE="TRI_AGENT"
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
