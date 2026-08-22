import PDFDocument from "pdfkit";

export type AnalyticsPdfData = {
  generatedAt: string;
  rangeLabel: string;
  onlineConnections: number;
  lines: number;
  activeStreams: number;
  contentCounts?: {
    live: number;
    movies: number;
    series: number;
    archive: number;
    transcode: number;
  };
  topChannels: { name: string; watchCount: number; type?: string }[];
  geo: { country: string; viewers: number }[];
  bandwidth: { time: string; mbps: number }[];
};

function buildPdfBuffer(fn: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    fn(doc);
    doc.end();
  });
}

export async function buildAnalyticsPdf(data: AnalyticsPdfData): Promise<Buffer> {
  return buildPdfBuffer((doc) => {
    doc.fontSize(20).text("Nexlify Panel — Analytics Report", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#555555");
    doc.text(`Generated: ${data.generatedAt}`);
    doc.text(`Range: ${data.rangeLabel}`);
    doc.moveDown();

    doc.fillColor("#000000").fontSize(14).text("Overview");
    doc.fontSize(11).moveDown(0.3);
    doc.text(`Open connections: ${data.onlineConnections}`);
    doc.text(`Total lines: ${data.lines}`);
    doc.text(`Active streams: ${data.activeStreams}`);

    if (data.contentCounts) {
      doc.moveDown(0.5);
      doc.fontSize(14).text("Content");
      doc.fontSize(11).moveDown(0.3);
      doc.text(`Live: ${data.contentCounts.live} · Movies: ${data.contentCounts.movies} · Series: ${data.contentCounts.series}`);
      doc.text(`Archive-enabled: ${data.contentCounts.archive} · Transcode: ${data.contentCounts.transcode}`);
    }

    if (data.topChannels.length) {
      doc.moveDown();
      doc.fontSize(14).text("Top channels");
      doc.fontSize(10).moveDown(0.3);
      data.topChannels.slice(0, 15).forEach((ch, i) => {
        doc.text(`${i + 1}. ${ch.name} (${ch.type ?? "LIVE"}) — ${ch.watchCount} views`);
      });
    }

    if (data.geo.length) {
      doc.moveDown();
      doc.fontSize(14).text("Viewers by country");
      doc.fontSize(10).moveDown(0.3);
      data.geo.slice(0, 12).forEach((g) => {
        doc.text(`${g.country}: ${g.viewers}`);
      });
    }

    if (data.bandwidth.length) {
      doc.moveDown();
      doc.fontSize(14).text("Bandwidth samples");
      doc.fontSize(9).moveDown(0.3);
      const recent = data.bandwidth.slice(-12);
      recent.forEach((b) => {
        doc.text(`${b.time.slice(11, 19)} UTC — ${b.mbps.toFixed(2)} Mbps`);
      });
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor("#888888").text("Nexlify Panel · Admin → Analytics for live charts and CSV export.");
  });
}
