# Adsforge

Adsforge is a powerful platform for managing and analyzing advertising data. This repository uses a monorepo structure with a dedicated frontend and backend.

## Project Structure

- **[client/](./client)**: A modern React application built with Vite and styled with CSS/Tailwind.
- **[server/](./server)**: A robust Node.js API that handles data processing and database interactions.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Recommended version: 18 or higher)
- npm (comes with Node.js)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Adsforge
   ```

2. **Setup the Backend:**
   ```bash
   cd server
   npm install
   # Configure your .env file
   npm run dev
   ```

3. **Setup the Frontend:**
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Development

- The frontend typically runs on [http://localhost:5173](http://localhost:5173).
- The backend API runs on [http://localhost:5000](http://localhost:5000) (verify your server config).

## License

[MIT License](LICENSE)
