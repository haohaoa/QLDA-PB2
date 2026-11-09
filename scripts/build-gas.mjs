import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const target = path.join(root, 'QLDA', 'Index.html');

execSync('npm run build -- --mode gas', { cwd: root, stdio: 'inherit' });

let html = await readFile(path.join(dist, 'index.html'), 'utf8');
const assetPath = (value) => path.join(dist, value.replace(/^\.?\//, ''));
const stylesheet = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/gi)].find(
  (match) => !/^https?:\/\//i.test(match[1])
);
const script = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/i);

if (!stylesheet || !script) {
  throw new Error('Không tìm thấy CSS hoặc JavaScript trong bản build của giao diện.');
}

const [css, javascript] = await Promise.all([
  readFile(assetPath(stylesheet[1]), 'utf8'),
  readFile(assetPath(script[1]), 'utf8'),
]);

html = html
  .replace(stylesheet[0], () => `<style>\n${css}\n</style>`)
  .replace(/<link[^>]+href="https:\/\/unpkg\.com\/leaflet@[^"]+"[^>]*>/i, '')
  .replace(script[0], '');

const encodedJavaScript = Buffer.from(javascript, 'utf8').toString('base64');
const encodedLines = encodedJavaScript.match(/.{1,8192}/g)?.join('\n') || '';
const loader = `<div id="qlda-app-bundle" hidden>${encodedLines}</div>
<script>
(function () {
  function showError(error) {
    var root = document.getElementById('root');
    if (root) {
      root.innerHTML = '<pre style="margin:24px;padding:16px;color:#991b1b;background:#fef2f2;white-space:pre-wrap"></pre>';
      root.firstChild.textContent = 'Không tải được giao diện: ' + error.message;
    }
  }

  try {
    var encoded = document.getElementById('qlda-app-bundle').textContent.replace(/\\s/g, '');
    var bytes = Uint8Array.from(atob(encoded), function (character) {
      return character.charCodeAt(0);
    });
    var bundle = document.createElement('script');
    bundle.type = 'module';
    bundle.onerror = function () {
      showError(new Error('Trình duyệt không thể chạy giao diện. Hãy cập nhật phiên bản deployment Apps Script.'));
    };
    bundle.textContent = new TextDecoder().decode(bytes);
    document.body.appendChild(bundle);
  } catch (error) {
    showError(error);
  }
})();
</script>`;

html = html.replace('</body>', () => `${loader}\n</body>`);

await writeFile(target, html, 'utf8');
console.log(`Google Apps Script HTML created: ${path.relative(root, target)}`);
