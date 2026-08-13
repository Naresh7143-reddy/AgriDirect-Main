#!/usr/bin/env node
/**
 * Generate a Word document (.docx) from test results
 * Converts JSON test results into a formatted Word document with tables, formatting, and styling
 * 
 * Usage: node generate_word_report.js <test-results.json> <output.docx> "<suite-title>"
 */

const { Document, Packer, Table, TableCell, TableRow, Paragraph, TextRun, convertInchesToTwip, BorderStyle, VerticalAlign, AlignmentType, HeadingLevel } = require('docx');
const fs = require('fs');
const path = require('path');

const [, , resultsPath, outputPath, suiteTitle] = process.argv;

if (!resultsPath || !outputPath) {
  console.error('Usage: node generate_word_report.js <test-results.json> <output.docx> "<suite-title>"');
  process.exit(1);
}

let testResults = {
  suite: suiteTitle || 'Test Report',
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  cases: [],
};

// Parse test results if file exists
if (fs.existsSync(resultsPath)) {
  try {
    const content = fs.readFileSync(resultsPath, 'utf8');
    testResults = JSON.parse(content);
  } catch (e) {
    console.warn(`Warning: Could not parse ${resultsPath}: ${e.message}`);
  }
}

const { total, passed, failed, skipped, cases = [] } = testResults;
const successRate = total > 0 ? Math.round((passed / total) * 100) : 0;

// Helper function to create bordered cells
function createCell(content, options = {}) {
  return new TableCell({
    children: [
      new Paragraph({
        text: content,
        alignment: options.align || AlignmentType.LEFT,
        ...options.text,
      }),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    ...options.cell,
  });
}

// Create header cells with background color
function createHeaderCell(content) {
  return createCell(content, {
    align: AlignmentType.CENTER,
    text: {
      bold: true,
      color: 'FFFFFF',
      size: 22,
    },
    cell: {
      shading: {
        type: 'clear',
        color: '366092',
      },
    },
  });
}

// Color codes for status
function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'passed':
      return '31A24C';
    case 'failed':
      return 'D32F2F';
    case 'skipped':
      return 'FFA500';
    default:
      return '757575';
  }
}

function getStatusEmoji(status) {
  switch (status?.toLowerCase()) {
    case 'passed':
      return '✓';
    case 'failed':
      return '✗';
    case 'skipped':
      return '⊘';
    default:
      return '•';
  }
}

// Build test cases table rows
const testCaseRows = [
  new TableRow({
    children: [
      createHeaderCell('#'),
      createHeaderCell('Test Case'),
      createHeaderCell('File'),
      createHeaderCell('Status'),
      createHeaderCell('Duration (ms)'),
    ],
  }),
];

cases.forEach((testCase, index) => {
  const statusColor = getStatusColor(testCase.status);
  const statusEmoji = getStatusEmoji(testCase.status);
  
  testCaseRows.push(
    new TableRow({
      children: [
        createCell(String(index + 1), { align: AlignmentType.CENTER }),
        createCell(testCase.name || 'Unknown', { align: AlignmentType.LEFT }),
        createCell(testCase.file || 'N/A', { align: AlignmentType.CENTER, text: { size: 18 } }),
        createCell(`${statusEmoji} ${testCase.status?.toUpperCase() || 'UNKNOWN'}`, {
          align: AlignmentType.CENTER,
          text: {
            bold: true,
            color: statusColor,
          },
        }),
        createCell(String(testCase.duration || 0), { align: AlignmentType.RIGHT }),
      ],
    })
  );
});

// Build document
const sections = [
  // Title
  new Paragraph({
    text: `${testResults.suite}`,
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    border: {
      bottom: {
        color: '366092',
        space: 1,
        style: BorderStyle.DOUBLE,
        size: 6,
      },
    },
  }),

  // Summary section
  new Paragraph({
    text: 'Summary',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
  }),

  // Summary table
  new Table({
    width: { size: 100, type: 'pct' },
    rows: [
      new TableRow({
        children: [
          createHeaderCell('Total Tests'),
          createHeaderCell('Passed'),
          createHeaderCell('Failed'),
          createHeaderCell('Skipped'),
          createHeaderCell('Success Rate'),
        ],
      }),
      new TableRow({
        children: [
          createCell(String(total), { align: AlignmentType.CENTER, text: { bold: true, size: 24 } }),
          createCell(String(passed), {
            align: AlignmentType.CENTER,
            text: { bold: true, size: 24, color: '31A24C' },
          }),
          createCell(String(failed), {
            align: AlignmentType.CENTER,
            text: { bold: true, size: 24, color: 'D32F2F' },
          }),
          createCell(String(skipped), {
            align: AlignmentType.CENTER,
            text: { bold: true, size: 24, color: 'FFA500' },
          }),
          createCell(`${successRate}%`, {
            align: AlignmentType.CENTER,
            text: { bold: true, size: 24, color: '366092' },
          }),
        ],
      }),
    ],
  }),

  new Paragraph({ text: '' }),

  // Test cases section
  new Paragraph({
    text: 'Test Cases',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
  }),

  new Paragraph({
    text: cases.length > 0 ? `Total: ${cases.length} test cases` : 'No test cases found',
    spacing: { after: 100 },
    text: { size: 20, italic: true, color: '666666' },
  }),

  // Test cases table
  new Table({
    width: { size: 100, type: 'pct' },
    rows: testCaseRows.length > 0 ? testCaseRows : [
      new TableRow({
        children: [
          createCell('No test cases to display', {
            align: AlignmentType.CENTER,
            text: { italic: true },
          }),
        ],
      }),
    ],
  }),

  new Paragraph({ text: '' }),

  // Footer
  new Paragraph({
    text: `Generated on ${new Date().toISOString()}`,
    alignment: AlignmentType.CENTER,
    spacing: { before: 200 },
    border: {
      top: {
        color: 'CCCCCC',
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    text: { size: 18, italic: true, color: '999999' },
  }),
];

// Create document
const doc = new Document({
  sections: [
    {
      children: sections,
      margins: {
        top: convertInchesToTwip(1),
        right: convertInchesToTwip(1),
        bottom: convertInchesToTwip(1),
        left: convertInchesToTwip(1),
      },
    },
  ],
});

// Write document
Packer.toBuffer(doc).then((buffer) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Word document generated: ${outputPath}`);
  console.log(`  - Total tests: ${total}`);
  console.log(`  - Passed: ${passed} (${successRate}%)`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Skipped: ${skipped}`);
});
