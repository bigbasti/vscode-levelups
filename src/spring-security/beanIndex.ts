import {
  BeanInfo,
  detectBeansInSource,
  MethodInfo,
} from "../java/javaClassResolver";

export class BeanIndex {
  private byName = new Map<string, BeanInfo>();
  private byFile = new Map<string, string[]>(); // filePath -> bean names

  get(beanName: string): BeanInfo | undefined {
    return this.byName.get(beanName);
  }

  all(): BeanInfo[] {
    return [...this.byName.values()];
  }

  updateFromSource(filePath: string, source: string): void {
    this.removeFile(filePath);
    const names: string[] = [];

    for (const bean of detectBeansInSource(source, filePath)) {
      this.byName.set(bean.beanName, bean);
      names.push(bean.beanName);
    }

    for (const bean of detectBeanFactoryMethods(source, filePath)) {
      this.byName.set(bean.beanName, bean);
      names.push(bean.beanName);
    }

    this.byFile.set(filePath, names);
  }

  removeFile(filePath: string): void {
    const names = this.byFile.get(filePath);
    if (names) {
      for (const n of names) {
        const existing = this.byName.get(n);
        if (existing && existing.filePath === filePath) {
          this.byName.delete(n);
        }
      }
      this.byFile.delete(filePath);
    }
  }

  clear(): void {
    this.byName.clear();
    this.byFile.clear();
  }
}

function detectBeanFactoryMethods(
  source: string,
  filePath: string
): BeanInfo[] {
  const lines = source.split(/\r?\n/);
  const beans: BeanInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/@Bean\b/.test(lines[i])) {
      // method declaration is on this or a following line
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const m = /\b([A-Za-z_$][\w$]*)\s*\(/.exec(lines[j]);
        if (m && !/@Bean/.test(lines[j].slice(m.index))) {
          const name = m[1];
          const method: MethodInfo = {
            name,
            filePath,
            line: j,
            column: lines[j].indexOf(name),
          };
          beans.push({
            beanName: name,
            className: name,
            filePath,
            classLine: j,
            classColumn: method.column,
            methods: [method],
          });
          break;
        }
      }
    }
  }
  return beans;
}
