# InFin

InFin is an AI-powered parametric income insurance platform designed specifically for platform-based delivery workers in India. It aims to provide financial security and stability to gig workers by offering innovative, data-driven insurance solutions tailored to their unique needs and income patterns.

## Features

- **Parametric Income Insurance**: Dynamic and tailored insurance coverage for gig workers based on real-time data and AI analysis.
- **AI-Powered Insights**: Leveraging artificial intelligence to assess risk and determine payouts efficiently.
- **User-Friendly Interface**: An intuitive and accessible interface built with modern web technologies to ensure a seamless experience for delivery workers.
- **Secure Platform**: Built with robust security measures to protect user data and ensure trust.

## Tech Stack

This project is built using modern web development tools and libraries:

- **Frontend Framework**: React 19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4 & tailwind-merge & clsx
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Backend/Database**: Supabase

## Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd InFin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Running the Development Server

Start the local development server:

```bash
npm run dev
```

The application will be available at the URL provided in the terminal (usually `http://localhost:5173`).

### Building for Production

To create a production build:

```bash
npm run build
```

This will generate an optimized build in the `dist` directory.

## License

This project is licensed under the MIT License.
