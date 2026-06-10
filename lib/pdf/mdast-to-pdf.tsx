/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Text, View, Link, StyleSheet } from "@react-pdf/renderer";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { PDF } from "./theme";

// Converts policy markdown (GFM, incl. tables) into @react-pdf primitives.
// Default Helvetica family; Typhoon design-system colours applied via styles.

const s = StyleSheet.create({
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold", color: PDF.ink, marginTop: 14, marginBottom: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: PDF.ink, marginTop: 12, marginBottom: 5 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PDF.ink, marginTop: 9, marginBottom: 4 },
  h4: { fontSize: 10, fontFamily: "Helvetica-Bold", color: PDF.gray700, marginTop: 7, marginBottom: 3 },
  para: { fontSize: 10, color: PDF.gray700, lineHeight: 1.5, marginBottom: 6 },
  listRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 8 },
  bullet: { fontSize: 10, color: PDF.gray500, width: 16 },
  listItemBody: { flex: 1 },
  listItemText: { fontSize: 10, color: PDF.gray700, lineHeight: 1.5 },
  hr: { borderBottomWidth: 1, borderBottomColor: PDF.gray200, marginVertical: 10 },
  codeBlock: { backgroundColor: PDF.gray100, padding: 6, borderRadius: 4, marginBottom: 6 },
  codeText: { fontFamily: "Courier", fontSize: 9, color: PDF.gray700 },
  quote: { borderLeftWidth: 3, borderLeftColor: PDF.brand, paddingLeft: 8, marginBottom: 6 },
  table: { borderWidth: 1, borderColor: PDF.gray200, borderRadius: 4, marginBottom: 8 },
  tableRow: { flexDirection: "row" },
  tableRowBorder: { borderTopWidth: 1, borderTopColor: PDF.gray200 },
  th: { flex: 1, padding: 5, backgroundColor: PDF.gray100 },
  thText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: PDF.ink },
  td: { flex: 1, padding: 5, borderLeftWidth: 1, borderLeftColor: PDF.gray200 },
  tdFirst: { flex: 1, padding: 5 },
  cellText: { fontSize: 9, color: PDF.gray700, lineHeight: 1.4 },
  strong: { fontFamily: "Helvetica-Bold" },
  em: { fontFamily: "Helvetica-Oblique" },
  code: { fontFamily: "Courier" },
  link: { color: PDF.brand, textDecoration: "none" },
});

// ── Inline nodes → React text spans ─────────────────────────────────────────
function renderInline(nodes: any[]): React.ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    switch (n.type) {
      case "text":
        return n.value as string;
      case "strong":
        return (
          <Text key={i} style={s.strong}>
            {renderInline(n.children)}
          </Text>
        );
      case "emphasis":
        return (
          <Text key={i} style={s.em}>
            {renderInline(n.children)}
          </Text>
        );
      case "inlineCode":
        return (
          <Text key={i} style={s.code}>
            {n.value}
          </Text>
        );
      case "delete":
        return (
          <Text key={i} style={{ textDecoration: "line-through" }}>
            {renderInline(n.children)}
          </Text>
        );
      case "link":
        return (
          <Link key={i} src={n.url} style={s.link}>
            {renderInline(n.children)}
          </Link>
        );
      case "break":
        return "\n";
      default:
        return n.children ? renderInline(n.children) : null;
    }
  });
}

function cellText(node: any): React.ReactNode[] {
  return renderInline(node.children ?? []);
}

// ── Block nodes ─────────────────────────────────────────────────────────────
function renderTable(node: any, key: number) {
  const rows: any[] = node.children ?? [];
  return (
    <View key={key} style={s.table} wrap={false}>
      {rows.map((row, ri) => {
        const cells: any[] = row.children ?? [];
        const isHeader = ri === 0;
        return (
          <View
            key={ri}
            style={[s.tableRow, ri > 0 ? s.tableRowBorder : {}] as any}
          >
            {cells.map((cell, ci) => (
              <View
                key={ci}
                style={isHeader ? s.th : ci === 0 ? s.tdFirst : s.td}
              >
                <Text style={isHeader ? s.thText : s.cellText}>
                  {cellText(cell)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function renderList(node: any, key: number) {
  const ordered = !!node.ordered;
  const start = typeof node.start === "number" ? node.start : 1;
  return (
    <View key={key}>
      {(node.children ?? []).map((item: any, i: number) => {
        const marker = ordered ? `${start + i}.` : "•";
        // listItem children are usually paragraphs; flatten their inline text.
        const inline = (item.children ?? []).flatMap((c: any) =>
          c.type === "paragraph" ? renderInline(c.children) : renderInline([c])
        );
        return (
          <View key={i} style={s.listRow} wrap={false}>
            <Text style={s.bullet}>{marker}</Text>
            <View style={s.listItemBody}>
              <Text style={s.listItemText}>{inline}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function renderBlock(node: any, key: number): React.ReactNode {
  switch (node.type) {
    case "heading": {
      const style = [s.h1, s.h2, s.h3, s.h4][Math.min(node.depth, 4) - 1];
      return (
        <Text key={key} style={style}>
          {renderInline(node.children)}
        </Text>
      );
    }
    case "paragraph":
      return (
        <Text key={key} style={s.para}>
          {renderInline(node.children)}
        </Text>
      );
    case "list":
      return renderList(node, key);
    case "table":
      return renderTable(node, key);
    case "thematicBreak":
      return <View key={key} style={s.hr} />;
    case "code":
      return (
        <View key={key} style={s.codeBlock} wrap={false}>
          <Text style={s.codeText}>{node.value}</Text>
        </View>
      );
    case "blockquote":
      return (
        <View key={key} style={s.quote}>
          {(node.children ?? []).map((c: any, i: number) => renderBlock(c, i))}
        </View>
      );
    case "html":
      return null; // skip raw HTML
    default:
      return node.children
        ? (node.children as any[]).map((c, i) => renderBlock(c, i))
        : null;
  }
}

export function markdownToPdf(md: string): React.ReactNode[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as any;
  return (tree.children ?? []).map((node: any, i: number) =>
    renderBlock(node, i)
  );
}
