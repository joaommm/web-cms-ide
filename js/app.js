let github = null;
let currentUser = null;
let currentRepo = null;
let currentFile = null;
let currentPath = ''; // Controla a pasta atual

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
  currentPath = ''; // Reseta para a raiz ao abrir um repositório
  currentRepoTitle.textContent = `Repositório: ${repoName}`;

  dashboardSection.style.display = 'none';
  editorSection.style.display = 'block';

  loadFiles('');
}

async function loadFiles(path = '') {
  currentPath = path;
  fileTree.innerHTML = '<li>Carregando arquivos...</li>';
  
  try {
    const contents = await github.getContents(currentUser.login, currentRepo, path);
    fileTree.innerHTML = '';

    // Se estivermos dentro de uma subpasta, cria o item para voltar para a pasta pai
    if (path !== '') {
      const backLi = document.createElement('li');
      backLi.innerHTML = '<strong>⬅️ .. (Voltar)</strong>';
      backLi.style.cursor = 'pointer';
      backLi.addEventListener('click', () => {
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        loadFiles(parentPath);
      });
      fileTree.appendChild(backLi);
    }

    contents.forEach(item => {
      const li = document.createElement('li');
      const icon = item.type === 'dir' ? '📁' : '📄';
      li.textContent = `${icon} ${item.name}`;

      if (item.type === 'dir') {
        // Entra na subpasta ao clicar
        li.style.fontWeight = 'bold';
        li.addEventListener('click', () => loadFiles(item.path));
      } else if (item.type === 'file') {
        // Abre o arquivo no editor ao clicar
        li.addEventListener('click', () => openFile(item.path));
      }

      fileTree.appendChild(li);
    });
  } catch (error) {
    fileTree.innerHTML = '<li>Erro ao carregar arquivos.</li>';
  }
}

async function openFile(filePath) {
  editorStatus.style.color = '#333';
  editorStatus.textContent = 'Carregando arquivo...';

  try {
    const fileData = await github.getFile(currentUser.login, currentRepo, filePath);
    
    // Decodifica conteúdo Base64 com suporte a caracteres UTF-8
    const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));

    currentFile = {
      path: fileData.path,
      sha: fileData.sha
    };

    currentFileTitle.textContent = `Arquivo: ${fileData.name}`;
    fileContent.value = decodedContent;
    saveFileBtn.style.display = 'inline-block';
    editorStatus.textContent = '';
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = 'Erro ao abrir arquivo: ' + error.message;
  }
}

saveFileBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  editorStatus.style.color = '#333';
  editorStatus.textContent = 'Salvando alterações...';

  try {
    const newContent = fileContent.value;
    const result = await github.updateFile(
      currentUser.login,
      currentRepo,
      currentFile.path,
      newContent,
      currentFile.sha
    );

    // Atualiza o SHA do arquivo para permitir edições subsequentes na mesma sessão
    currentFile.sha = result.content.sha;

    editorStatus.style.color = 'green';
    editorStatus.textContent = 'Alterações salvas com sucesso no GitHub!';
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = error.message;
  }
});

backToReposBtn.addEventListener('click', () => {
  currentFile = null;
  fileContent.value = '';
  saveFileBtn.style.display = 'none';
  currentFileTitle.textContent = 'Nenhum arquivo selecionado';
  editorStatus.textContent = '';
  loadRepositories();
});
