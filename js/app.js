let github = null;
let currentUser = null;
let currentRepo = null;
let currentFile = null; // Guardará as informações do ficheiro aberto (path, sha)

const tokenInput = document.getElementById('token-input');
const connectBtn = document.getElementById('connect-btn');
const authStatus = document.getElementById('auth-status');

const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const editorSection = document.getElementById('editor-section');

const repoList = document.getElementById('repo-list');
const fileTree = document.getElementById('file-tree');
const currentRepoTitle = document.getElementById('current-repo-title');
const currentFileTitle = document.getElementById('current-file-title');
const fileContent = document.getElementById('file-content');
const saveFileBtn = document.getElementById('save-file-btn');
const editorStatus = document.getElementById('editor-status');
const backToReposBtn = document.getElementById('back-to-repos-btn');

connectBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    authStatus.style.color = 'red';
    authStatus.textContent = 'Por favor, informe o token.';
    return;
  }

  authStatus.style.color = '#333';
  authStatus.textContent = 'Conectando...';

  try {
    github = new GitHubAPI(token);
    currentUser = await github.getUser();

    authStatus.style.color = 'green';
    authStatus.textContent = `Conectado como ${currentUser.login}!`;

    sessionStorage.setItem('gh_token', token);
    loadRepositories();
  } catch (error) {
    authStatus.style.color = 'red';
    authStatus.textContent = error.message;
  }
});

async function loadRepositories() {
  try {
    const repos = await github.getRepositories();
    loginSection.style.display = 'none';
    editorSection.style.display = 'none';
    dashboardSection.style.display = 'block';

    repoList.innerHTML = '';
    repos.forEach(repo => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${repo.name}</strong>
        <button onclick="selectRepo('${repo.name}')">Abrir</button>
      `;
      repoList.appendChild(li);
    });
  } catch (error) {
    alert('Erro ao listar repositórios: ' + error.message);
  }
}

async function selectRepo(repoName) {
  currentRepo = repoName;
  currentRepoTitle.textContent = `Repositório: ${repoName}`;

  dashboardSection.style.display = 'none';
  editorSection.style.display = 'block';

  loadFiles('');
}

async function loadFiles(path = '') {
  fileTree.innerHTML = '<li>Carregando ficheiros...</li>';
  try {
    const contents = await github.getContents(currentUser.login, currentRepo, path);
    fileTree.innerHTML = '';

    contents.forEach(item => {
      const li = document.createElement('li');
      const icon = item.type === 'dir' ? '📁' : '📄';
      li.textContent = `${icon} ${item.name}`;

      if (item.type === 'file') {
        li.addEventListener('click', () => openFile(item.path));
      }

      fileTree.appendChild(li);
    });
  } catch (error) {
    fileTree.innerHTML = '<li>Erro ao carregar ficheiros.</li>';
  }
}

async function openFile(filePath) {
  editorStatus.style.color = '#333';
  editorStatus.textContent = 'Carregando ficheiro...';

  try {
    const fileData = await github.getFile(currentUser.login, currentRepo, filePath);
    
    // Decodifica conteúdo Base64 (suportando caracteres especiais/UTF-8)
    const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));

    currentFile = {
      path: fileData.path,
      sha: fileData.sha
    };

    currentFileTitle.textContent = `Ficheiro: ${fileData.name}`;
    fileContent.value = decodedContent;
    saveFileBtn.style.display = 'inline-block';
    editorStatus.textContent = '';
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = 'Erro ao abrir ficheiro: ' + error.message;
  }
}

saveFileBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  editorStatus.style.color = '#333';
  editorStatus.textContent = 'Guardando alterações...';

  try {
    const newContent = fileContent.value;
    const result = await github.updateFile(
      currentUser.login,
      currentRepo,
      currentFile.path,
      newContent,
      currentFile.sha
    );

    // Atualiza o SHA do ficheiro com a nova versão retornada pela API
    currentFile.sha = result.content.sha;

    editorStatus.style.color = 'green';
    editorStatus.textContent = 'Alterações guardadas com sucesso no GitHub!';
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = error.message;
  }
});

backToReposBtn.addEventListener('click', () => {
  currentFile = null;
  fileContent.value = '';
  saveFileBtn.style.display = 'none';
  currentFileTitle.textContent = 'Nenhum ficheiro selecionado';
  editorStatus.textContent = '';
  loadRepositories();
});
