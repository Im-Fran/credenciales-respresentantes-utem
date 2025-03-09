import { Hono } from 'hono'
import {JWT} from "google-auth-library"
import {GoogleSpreadsheet, GoogleSpreadsheetWorksheet} from "google-spreadsheet";

const app = new Hono()
const jwt = new JWT({
  email: process.env.GS_CLIENT_EMAIL,
  key: process.env.GS_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
});
const sheets = new GoogleSpreadsheet(process.env.SHEETS_ID || '', jwt)
let lastLoad = 0

app.get('/', (c) => c.text('Por favor visita /info/:correo para obtener los datos'))

app.get('/info/:correo', async (c) => {
  const {correo} = c.req.param()

  if(lastLoad === 0 || ((Date.now() - lastLoad) > (1000 * 60 * 5))) {
    await sheets.loadInfo()
    lastLoad = Date.now()
  }

  const sheet = sheets.sheetsByIndex[0]
  const rows = await sheet.getRows()
  const row = rows.find((row) => (row.get('Dirección de correo electrónico') as string).toLowerCase().startsWith(correo.toLowerCase()))

  if(row == null) {
    return c.json({
      error: "No se encontró el correo",
    }, 404)
  }

  return c.json({
    correo: encodeURIComponent(row.get('Dirección de correo electrónico')?.trim()),
    nombre: encodeURIComponent(row.get('Nombre y apellido (Juan Lopez)')?.trim()),
    cargo: encodeURIComponent(row.get('Cargo')?.trim()),
    carrera: encodeURIComponent(row.get('Carrera')?.trim()),
    selfie: encodeURIComponent(row.get('Sube una selfie')?.trim())
  })
})

app.get('/valida/:correo', async (c) => {
  const {correo} = c.req.param()

  if(lastLoad === 0 || ((Date.now() - lastLoad) > (1000 * 60 * 5))) {
    await sheets.loadInfo()
    lastLoad = Date.now()
  }

  const sheet = sheets.sheetsByIndex[0]
  const rows = await sheet.getRows()
  const row = rows.find((row) => (row.get('Dirección de correo electrónico') as string).toLowerCase().startsWith(correo.toLowerCase()))

  if(row == null) {
    return c.json({
      error: "No se encontró el correo!",
    }, 404)
  }

  return c.json({
    status: 200,
    message: 'Correo válido!'
  })
})

export default app