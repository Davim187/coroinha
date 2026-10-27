import type { MonthlyAttendanceReport } from './attendance-report.js'
import type { MeetingReport } from './meeting-report.js'
import { pdfHeading, renderPdf } from '../pdf.js'

function writeBlock(doc: PDFKit.PDFDocument, title: string, body: string | null | undefined) {
  doc.font('Times-Bold').fontSize(12).text(title)
  doc.moveDown(0.2)
  doc.font('Times-Roman').fontSize(11).text(body?.trim() ? body : 'Não informado.', { align: 'left' })
  doc.moveDown(0.7)
}

export function renderMonthlyAttendancePdf(parishName: string, report: MonthlyAttendanceReport) {
  return renderPdf((doc) => {
    pdfHeading(doc, parishName, `Relatório mensal de presença — ${report.label}`)
    doc.font('Times-Roman').fontSize(11)
    doc.text(`Celebrações: ${report.summary.celebrations}`)
    doc.text(`Publicadas/concluídas: ${report.summary.publishedOrCompleted}`)
    doc.text(`Com presença completa: ${report.summary.withAttendance}`)
    doc.text(`Sem presença completa: ${report.summary.withoutAttendance}`)
    doc.text(`Funções preenchidas: ${report.summary.assignments}`)
    doc.text(`Presentes: ${report.summary.present} · Atrasados: ${report.summary.late}`)
    doc.text(`Ausentes: ${report.summary.absent} · Justificados: ${report.summary.justified}`)
    doc.text(`Sem registro: ${report.summary.unrecorded}`)
    doc.moveDown(0.8)

    doc.font('Times-Bold').fontSize(13).text('Quem mais serviu')
    doc.moveDown(0.3)
    doc.font('Times-Roman').fontSize(11)
    if (!report.mostServed.length) doc.text('Ninguém escalado neste mês.')
    for (const item of report.mostServed) {
      doc.text(`${item.name}: ${item.assignments} funções (${item.present} presentes)`)
    }
    doc.moveDown(0.7)

    doc.font('Times-Bold').fontSize(13).text('Quem menos serviu')
    doc.moveDown(0.3)
    doc.font('Times-Roman').fontSize(11)
    if (!report.leastServed.length) doc.text('Ninguém escalado neste mês.')
    for (const item of report.leastServed) {
      doc.text(`${item.name}: ${item.assignments} funções`)
    }
    doc.moveDown(0.7)

    doc.font('Times-Bold').fontSize(13).text('Quem mais faltou')
    doc.moveDown(0.3)
    doc.font('Times-Roman').fontSize(11)
    if (!report.mostAbsent.length) doc.text('Nenhuma ausência registrada.')
    for (const item of report.mostAbsent) {
      doc.text(`${item.name}: ${item.absent} ausências e ${item.justified} justificadas`)
    }
    doc.moveDown(0.7)

    doc.font('Times-Bold').fontSize(13).text('Ausências e justificativas')
    doc.moveDown(0.3)
    doc.font('Times-Roman').fontSize(11)
    if (!report.absences.length) doc.text('Nenhuma ausência ou justificativa registrada.')
    for (const item of report.absences) {
      doc.text(`${item.date} · ${item.celebration} · ${item.coroinha} (${item.role}) · ${item.status}`)
    }
    doc.moveDown(0.7)

    doc.font('Times-Bold').fontSize(13).text('Detalhe por coroinha')
    doc.moveDown(0.3)
    doc.font('Times-Roman').fontSize(10)
    for (const item of report.people.filter((row) => row.assignments > 0)) {
      doc.text(
        `${item.name}: ${item.assignments} funções · ${item.present} presentes · ${item.absent} ausentes · ${item.late} atrasos · ${item.justified} justificadas · ${item.unrecorded} sem registro${item.presenceRate === null ? '' : ` · ${item.presenceRate}% presença`}`,
      )
    }
  })
}

export function renderMeetingReportPdf(parishName: string, report: MeetingReport) {
  return renderPdf((doc) => {
    pdfHeading(doc, parishName, 'Relatório da reunião')
    doc.font('Times-Bold').fontSize(16).text(report.title)
    doc.moveDown(0.3)
    doc.font('Times-Roman').fontSize(11)
    doc.text(`Data: ${report.date}`)
    doc.text(`Horário: ${report.startTime}–${report.endTime}`)
    doc.text(`Local: ${report.location || 'Não informado'}`)
    doc.text(`Situação: ${report.status}`)
    doc.text(`Responsável: ${report.organizer}`)
    doc.moveDown(0.8)

    writeBlock(doc, 'Pauta', report.agenda)
    writeBlock(doc, 'Observações', report.notes)
    writeBlock(doc, 'Decisões e encaminhamentos', report.decisions)
    writeBlock(doc, 'Participantes da coordenação', report.participants.join(', ') || 'Não informados.')

    doc.font('Times-Bold').fontSize(12).text('Presença dos coroinhas')
    doc.moveDown(0.2)
    doc.font('Times-Roman').fontSize(11)
    if (!report.attendance.length) {
      doc.text('Nenhuma presença registrada.')
    } else {
      for (const item of report.attendance) {
        doc.text(`${item.coroinha}: ${item.status}${item.notes ? ` — ${item.notes}` : ''}`)
      }
    }
    doc.moveDown(0.8)

    doc.font('Times-Bold').fontSize(12).text('Histórico de edições')
    doc.moveDown(0.2)
    doc.font('Times-Roman').fontSize(11)
    if (!report.history.length) {
      doc.text('Nenhuma edição registrada ainda.')
    } else {
      for (const entry of report.history) {
        const when = new Date(entry.at).toLocaleString('pt-BR')
        doc.font('Times-Bold').text(`${when} · ${entry.user}`)
        doc.font('Times-Roman').text(entry.summary)
        for (const change of entry.changes) {
          doc.text(`  ${change.field}: ${change.from ?? '—'} → ${change.to ?? '—'}`)
        }
        doc.moveDown(0.4)
      }
    }
  })
}
