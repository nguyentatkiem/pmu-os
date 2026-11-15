// Nhúng file SQL trong db/migrations vào mã nguồn để chạy được trên Vercel (không phụ thuộc fs lúc chạy).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(process.cwd(), "db/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const items = files.map((f) => ({ id: f.replace(/\.sql$/, ""), sql: readFileSync(join(dir, f), "utf8") }));
const out = `// File sinh tự động bởi scripts/embed-migrations.mjs - không sửa tay.\nexport const MIGRATIONS: { id: string; sql: string }[] = ${JSON.stringify(items, null, 2)};\n`;
writeFileSync(join(process.cwd(), "src/lib/server/migrations.generated.ts"), out);
console.log(`Đã nhúng ${items.length} migration`);
