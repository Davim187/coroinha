import PDFDocument from 'pdfkit'

export function renderPdf(draw: (doc: PDFKit.PDFDocument) => void) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    draw(doc)
    doc.end()
  })
}

export function pdfHeading(doc: PDFKit.PDFDocument, parish: string, title: string) {
  doc.fillColor('#0B1F3A').font('Times-Bold').fontSize(20).text(parish)
  doc.moveDown(0.15)
  doc.fillColor('#8C6E2F').font('Times-Roman').fontSize(12).text(title)
  doc.moveDown(0.4)
  doc.strokeColor('#C4A35A').lineWidth(1).moveTo(48, doc.y).lineTo(547, doc.y).stroke()
  doc.moveDown(0.8)
  doc.fillColor('#142033').font('Times-Roman')
}
