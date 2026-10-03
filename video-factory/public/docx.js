(() => {
  const decoder = new TextDecoder('utf-8');
  const cleanTitle = name => name.replace(/\.(docx|md|markdown|txt)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);

  function cleanMarkdown(value) {
    return String(value || '')
      .replace(/^---\s*[\s\S]*?\n---\s*/u, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(#{1,6}|>|[-*+] |\d+[.)] )\s*/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function inferTitle(text, filename) {
    const heading = String(text).match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
    const first = cleanMarkdown(text).split(/\n|(?<=[。！？!?])/u).map(item => item.trim()).find(Boolean);
    return (heading || cleanTitle(filename) || first || '未命名文案').replace(/[。！？!?]+$/u, '').slice(0, 120);
  }

  function findEntry(buffer, target) {
    const view = new DataView(buffer);
    let eocd = -1;
    for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 65557); offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) throw new Error('DOCX 文件结构无效。');
    const entries = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    for (let index = 0; index < entries; index++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('DOCX 目录损坏。');
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
      if (name === target) return { method, compressedSize, localOffset };
      offset += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error('DOCX 中没有找到正文。');
  }

  async function extractDocx(file) {
    const buffer = await file.arrayBuffer();
    const entry = findEntry(buffer, 'word/document.xml');
    const view = new DataView(buffer);
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('DOCX 正文索引无效。');
    const nameLength = view.getUint16(entry.localOffset + 26, true);
    const extraLength = view.getUint16(entry.localOffset + 28, true);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = new Blob([buffer.slice(start, start + entry.compressedSize)]);
    let xmlBytes;
    if (entry.method === 0) xmlBytes = await compressed.arrayBuffer();
    else if (entry.method === 8 && typeof DecompressionStream !== 'undefined') xmlBytes = await new Response(compressed.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    else throw new Error('当前浏览器无法解压此 DOCX，请改用 Markdown。');
    const xml = decoder.decode(xmlBytes);
    const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
    if (documentXml.querySelector('parsererror')) throw new Error('DOCX 正文无法读取。');
    const paragraphs = [...documentXml.getElementsByTagName('w:p')].map(paragraph => {
      const parts = [];
      for (const node of paragraph.getElementsByTagName('*')) {
        if (node.tagName === 'w:t') parts.push(node.textContent || '');
        else if (node.tagName === 'w:tab') parts.push(' ');
        else if (node.tagName === 'w:br') parts.push('\n');
      }
      return parts.join('').trim();
    }).filter(Boolean);
    return paragraphs.join('\n');
  }

  async function read(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件超过 5 MB。');
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'doc') throw new Error('旧版 .doc 无法安全解析，请在 Word 中另存为 .docx。');
    if (!['docx', 'md', 'markdown', 'txt'].includes(extension)) throw new Error('仅支持 DOCX、Markdown 和 TXT。');
    const original = extension === 'docx' ? await extractDocx(file) : await file.text();
    const text = cleanMarkdown(original);
    if (text.length < 100) throw new Error('文案少于 100 字，无法稳定达到 30 秒成片。');
    if (text.length > 760) throw new Error(`文案有 ${text.length} 字；为保证 180 秒内完成，请拆分为 760 字以内的多份文案后批量导入。`);
    return { id: crypto.randomUUID(), filename: file.name, title: inferTitle(original, file.name), text, characters: text.length, estimatedSeconds: Math.max(10, Math.round(text.length / 4.2)) };
  }

  window.ScriptImporter = { read, cleanMarkdown, inferTitle };
})();
