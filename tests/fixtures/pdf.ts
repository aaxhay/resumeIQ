import { PDFDocument, StandardFonts } from "pdf-lib";

export const syntheticResume = "SYNTHETIC CANDIDATE\n\nEXPERIENCE\nSoftware Engineer at Fictional Labs\nBuilt accessible web applications for a fictional product team.\n- Improved automated tests and documented reliable release workflows.\n- Collaborated with designers to simplify customer onboarding.\n\nSKILLS\nTypeScript, React, testing, documentation";

export async function syntheticPdf(text = syntheticResume, pages = 1): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    const page = document.addPage([612, 792]);
    if (text) page.drawText(text, { x: 40, y: 740, size: 11, font, lineHeight: 18 });
  }
  return Buffer.from(await document.save());
}
