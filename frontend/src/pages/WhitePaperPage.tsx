import type { ReactNode } from "react";
import AppLayout from "../layouts/AppLayout";
import { whitePaperText } from "../content/whitePaperSource";

type WhitePaperSection = {
  id: string;
  title: string;
  level: 2 | 3;
  lines: string[];
};

const createSlug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);

const buildSections = (source: string): WhitePaperSection[] => {
  const sections: WhitePaperSection[] = [];
  let current: WhitePaperSection | undefined;

  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^(#{2,3})\s+(\d+(?:\.\d+)*\.?\s+.+)$/);
    if (heading) {
      current = {
        id: createSlug(heading[2]),
        title: heading[2],
        level: heading[1].length as 2 | 3,
        lines: [],
      };
      sections.push(current);
    } else if (current) {
      current.lines.push(line.trimEnd());
    }
  }

  return sections;
};

const renderInlineText = (line: string): ReactNode[] =>
  line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });

const renderSectionBody = (section: WhitePaperSection): ReactNode[] => {
  const blocks: ReactNode[] = [];
  const lines = section.lines;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    const key = `${section.id}-${index}`;
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(lines[index].trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
        index += 1;
      }
      const [headers, ...body] = rows.filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
      blocks.push(
        <div key={key} className="whitepaper-data-table-wrap">
          <table className="whitepaper-data-table">
            <thead>
              <tr>{headers.map((cell, column) => <th key={column} scope="col">{renderInlineText(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => column === 0
                    ? <th key={column} scope="row">{renderInlineText(cell)}</th>
                    : <td key={column}>{renderInlineText(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listPattern = line.startsWith("- ") ? /^-\s+/ : /^\d+\.\s+/;
    if (listPattern.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && listPattern.test(lines[index].trim())) {
        items.push(<li key={index}>{renderInlineText(lines[index].trim().replace(listPattern, ""))}</li>);
        index += 1;
      }
      blocks.push(line.startsWith("- ") ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>);
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(<h3 key={key}>{renderInlineText(line.slice(4))}</h3>);
      index += 1;
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(\||-\s|\d+\.\s|###\s)/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={key}>{renderInlineText(paragraph.join(" "))}</p>);
  }

  return blocks;
};
const sections = buildSections(whitePaperText);
const tocSections = sections;

const WhitePaperPage = () => {
  return (
    <AppLayout>
      <main className="whitepaper-page">
        <div className="whitepaper-shell">
          <nav className="whitepaper-breadcrumb" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span aria-hidden="true">/</span>
            <span>White Paper</span>
          </nav>

          <section id="whitepaper-top" className="whitepaper-hero">
            <span className="whitepaper-kicker">SMAJ PI HUB WHITE PAPER</span>
            <h1>SMAJ PI HUB White Paper</h1>
            <p>A Unified Digital Hub Connecting Services, Commerce, and Innovation on the Pi Network</p>
            <div className="whitepaper-meta-row" aria-label="White paper details">
              <span>Version 2.0</span>
              <span>Edited Publication Date: April 16, 2026</span>
              <span>Authored By: SMAJ Core Team</span>
            </div>
          </section>

          <div className="whitepaper-version-tabs" aria-label="White paper highlights">
            <a href="#1-executive-summary">Executive Summary</a>
            <a href="#7-the-solution-unified-access-and-intelligent-assistance">Unified Access</a>
            <a href="#9-long-term-modular-service-architecture">Planned Services</a>
            <a href="#12-roadmap-phased-rollout">Roadmap</a>
          </div>

          <div className="whitepaper-layout">
            <aside className="whitepaper-toc" aria-label="White paper table of contents">
              <h2>Contents</h2>
              <ol>
                {tocSections.map((section) => (
                  <li key={section.id} className={section.level === 3 ? "whitepaper-toc-subitem" : undefined}>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </li>
                ))}
              </ol>
            </aside>

            <article className="whitepaper-article">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="whitepaper-document-section">
                  {section.level === 3 ? (
                    <h3>{section.title}</h3>
                  ) : (
                    <h2>{section.title}</h2>
                  )}
                  <div className="whitepaper-section-body">
                    {renderSectionBody(section)}
                  </div>
                  {section.id !== sections[sections.length - 1]?.id ? (
                    <a className="whitepaper-scroll-link" href="#whitepaper-top">
                      Scroll Up
                    </a>
                  ) : null}
                </section>
              ))}
            </article>
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default WhitePaperPage;
