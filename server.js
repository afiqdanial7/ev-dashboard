// Import required libraries
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

// Create an Express application
const app = express();

// Railway (and most clouds) assigns a specific port via environment variable.
// If that variable is missing (like on your laptop), it falls back to 3000.
const port = process.env.PORT || 3000;

// Enable CORS (Cross-Origin Resource Sharing)
app.use(cors());

// Serve the HTML file from the project directory
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- DATABASE CONNECTION CONFIGURATION (UPDATED FOR RAILWAY) ---

// Check if we are in a production environment (Railway)
const isProduction = process.env.NODE_ENV === 'production';

// If we have a cloud database URL (from Railway), use it.
// Otherwise, use your local fallback string.
const connectionString = process.env.DATABASE_URL 
  ? process.env.DATABASE_URL 
  : 'postgresql://postgres:user@localhost:5432/ev_dashboard'; 

const pool = new Pool({
  connectionString: connectionString,
  // Railway requires SSL for database connections.
  // We disable 'rejectUnauthorized' to allow the connection to succeed with Railway's self-signed certs.
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// -------------------------------------------------------------

// A SINGLE, ROBUST API ENDPOINT to get all data
app.get('/api/data', async (req, res) => {
  try {
    // Query for the EV Registrations chart
    const chartQuery = `
      SELECT
        UPPER(TRIM(state)) as state,
        UPPER(TRIM(brand)) as brand,
        TO_CHAR(date_reg, 'YYYY-MM') AS month,
        COUNT(*) AS registrations
      FROM
        ev_registrations 
      WHERE
        state IS NOT NULL AND TRIM(state) <> '' AND
        brand IS NOT NULL AND TRIM(brand) <> '' AND 
        date_reg IS NOT NULL AND
        fuel IN ('electric', 'hybrid_petrol', 'hybrid_diesel')
      GROUP BY
        UPPER(TRIM(state)),
        UPPER(TRIM(brand)),
        TO_CHAR(date_reg, 'YYYY-MM')
      ORDER BY
        month;
    `;

    // Queries for the filters
    const brandQuery = "SELECT DISTINCT UPPER(TRIM(brand)) as brand FROM ev_registrations WHERE brand IS NOT NULL AND TRIM(brand) <> '' AND fuel IN ('electric', 'hybrid_petrol', 'hybrid_diesel') ORDER BY brand;";
    const stateQuery = "SELECT DISTINCT UPPER(TRIM(state)) as state FROM ev_registrations WHERE state IS NOT NULL AND TRIM(state) <> '' AND fuel IN ('electric', 'hybrid_petrol', 'hybrid_diesel') ORDER BY state;";
    const yearQuery = "SELECT DISTINCT EXTRACT(YEAR FROM date_reg)::text AS year FROM ev_registrations WHERE date_reg IS NOT NULL AND fuel IN ('electric', 'hybrid_petrol', 'hybrid_diesel') ORDER BY year;";

    // Query for Charging Stations
    const stationQuery = "SELECT name, latitude, longitude, state FROM charging_stations;";

    // Execute all queries in parallel
    const [chartResult, brandResult, stateResult, yearResult, stationResult] = await Promise.all([
      pool.query(chartQuery),
      pool.query(brandQuery),
      pool.query(stateQuery),
      pool.query(yearQuery),
      pool.query(stationQuery)
    ]);

    // Send the response
    res.json({
      chartData: chartResult.rows,
      stationData: stationResult.rows,
      filters: {
        brands: brandResult.rows.map(r => r.brand),
        states: stateResult.rows.map(r => r.state),
        years: yearResult.rows.map(r => r.year),
      }
    });

  } catch (err) {
    console.error('--- SEVERE DATABASE ERROR ---');
    console.error(err);
    console.error('--- END OF ERROR ---');
    res.status(500).send('A critical error occurred while fetching data from the database.');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});