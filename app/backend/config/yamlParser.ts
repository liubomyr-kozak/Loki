type YamlValue = string | number | boolean | YamlObject | YamlValue[];
type YamlObject = { [key: string]: YamlValue };

interface YamlStackFrame {
  indent: number;
  container: YamlObject | YamlValue[];
  key: string | null;
}

export function parseSimpleYaml(text: string): YamlObject {
  const lines = text.split(/\r?\n/);
  const root: YamlObject = {};
  const stack: YamlStackFrame[] = [];
  stack.push({ indent: -1, container: root, key: null });
  for (let rawLine of lines) {
    const hashIndex = rawLine.indexOf('#');
    if (hashIndex >= 0) {
      rawLine = rawLine.slice(0, hashIndex);
    }
    if (!rawLine.trim()) continue;
    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parentEntry = stack[stack.length - 1];
    let parent: YamlObject | YamlValue[] = parentEntry.container;
    if (parentEntry.key && (parent as YamlObject)[parentEntry.key] == null) {
      (parent as YamlObject)[parentEntry.key] = {};
    }
    parent = parentEntry.key ? (parent as YamlObject)[parentEntry.key] as YamlObject | YamlValue[] : parent;
    if (line.startsWith('- ')) {
      const itemStr = line.slice(2).trim();
      if (!Array.isArray(parent)) {
        (parentEntry.container as YamlObject)[parentEntry.key!] = [];
        parent = (parentEntry.container as YamlObject)[parentEntry.key!] as YamlValue[];
      }
      const value = parseValue(itemStr);
      parent.push(value);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        stack.push({ indent, container: value, key: null });
      }
    } else {
      const idx = line.indexOf(':');
      if (idx === -1) {
        throw new Error(`Invalid YAML line: ${line}`);
      }
      const key = line.slice(0, idx).trim();
      const rest = line.slice(idx + 1).trim();
      const parentObj = parent as YamlObject;
      if (!rest) {
        parentObj[key] = {};
        stack.push({ indent, container: parentObj, key });
      } else {
        const value = parseValue(rest);
        parentObj[key] = value;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          stack.push({ indent, container: parentObj, key });
        }
      }
    }
  }
  return root;
}

function parseValue(value: string): YamlValue {
  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === 'true';
  }
  if (/^[-+]?[0-9]+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^[-+]?[0-9]*\.[0-9]+$/.test(value)) {
    return parseFloat(value);
  }
  const single = /^'(.*)'$/;
  const double = /^"(.*)"$/;
  let m = value.match(single);
  if (m) return m[1];
  m = value.match(double);
  if (m) return m[1];
  return value;
}
