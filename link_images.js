const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const RESULT_FILE = path.join(__dirname, 'cloudinary_results.json');

async function linkImagesToDatabase() {
  try {
    if (!fs.existsSync(RESULT_FILE)) {
      console.log('Error: cloudinary_results.json file not found. Put it in this project folder.');
      return;
    }
    const imageDataList = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
    console.log(`Found ${imageDataList.length} image links.`);
    let updatedCount = 0;
    for (const img of imageDataList) {
      const rowNumber = parseInt(String(img.row_number).replace('row_number_', ''), 10);
      if (Number.isNaN(rowNumber)) continue;
      await pool.query(
        `UPDATE public.dataset_rows SET data = jsonb_set(data, '{image_url}', to_jsonb($1::text), true), updated_at = CURRENT_TIMESTAMP WHERE dataset_id = 2 AND row_number = $2`,
        [img.image_url, rowNumber]
      );
      updatedCount++;
      if (updatedCount % 100 === 0) console.log(`Updated ${updatedCount} rows...`);
    }
    console.log(`Done. Updated ${updatedCount} rows.`);
  } catch (error) {
    console.error('Database update failed:', error.message);
  } finally {
    await pool.end();
  }
}
linkImagesToDatabase();
