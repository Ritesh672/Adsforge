# Adsforge Server

This is the backend API for the Adsforge platform, built with Node.js and Express.

## Features

- RESTful API endpoints for ad management.
- Database integration for persistent storage.
- Environment-based configuration.

## Getting Started

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in this directory and add the following variables:

```env
PORT=5000
DATABASE_URL=your_database_connection_string
# Add other necessary variables here
```

### Running the Server

- **Development Mode:** `npm run dev`
- **Production Mode:** `npm start`

## API Documentation

- `GET /api/products`: Fetch all products.
- `POST /api/products`: Create a new product.
- (Add more endpoints as they are developed)
