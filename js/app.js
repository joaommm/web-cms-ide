let github = null;
let currentUser = null;
let currentRepo = null;
let currentFile = null;
let currentFolderPath = '';
let monacoEditor = null;
const isMobile = window.innerWidth <= 768;

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
const saveFileBtn = document.getElementById('save-file-btn');
const deleteFileBtn = document.getElementById('delete-file-btn');
const newFileBtn = document.getElementById('new-file-btn');
const newRepoBtn = document.getElementById('new-repo-btn');
const logoutBtn = document.getElementById('logout-btn');
const editorStatus = document.getElementById('editor-status');
const backToReposBtn = document.getElementById('back-to-repos-btn');
const currentPathDisplay = document.getElementById('current-path-display');
const mobileEditor = document.getElementById('mobile-editor');

const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const toastContainer = document.getElementById('toast-container');

// Utilitário para aguardar a sincronização do GitHub
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function showLoading(message = 'Carregando...') {
  loadingMessage.textContent = message;
  loadingOverlay.style.display = 'flex';
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function getLanguageFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'html': case 'htm': return 'html';
    case 'css': return 'css';
    case 'js': return 'javascript';
    case 'json': return 'json';
    case 'md': return 'markdown';
    default: return 'plaintext';
  }
}

if (!isMobile) {
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
      value: '// Selecione um arquivo para começar a editar...',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true
    });
  });
}

window.addEventListener('load', () => {
  const savedToken = localStorage.getItem('gh_token');
  if (savedToken) {
    tokenInput.value = savedToken;
    autoConnect(savedToken);
  }
});

async function autoConnect(token) {
  showLoading('Reconectando ao GitHub...');
  try {
    github = new GitHubAPI(token);
    currentUser = await github.getUser();
    await loadRepositories();
    showToast(`Bem-vindo de volta, ${currentUser.login}!`);
  } catch (error) {
    showToast('Sessão expirada ou token inválido.', 'error');
    localStorage.removeItem('gh_token');
  } finally {
    hideLoading();
  }
}

connectBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    showToast('Por favor, informe o token.', 'error');
    return;
  }

  showLoading('Autenticando...');
  try {
    github = new GitHubAPI(token);
    currentUser = await github.getUser();

    localStorage.setItem('gh_token', token);
    await loadRepositories();
    showToast('Conectado com sucesso!');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    hideLoading();
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('gh_token');
  location.reload();
});

async function loadRepositories() {
  showLoading('Buscando repositórios...');
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
        <div>
          <button onclick="selectRepo('${repo.name}')">Abrir</button>
          <button class="danger-btn" onclick="confirmDeleteRepo('${repo.name}')">Excluir</button>
        </div>
      `;
      repoList.appendChild(li);
    });
  } catch (error) {
    showToast('Erro ao listar repositórios: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

// Criar Repositório (com sincronização)
newRepoBtn.addEventListener('click', async () => {
  const repoName = prompt('Digite o nome do novo repositório:');
  if (!repoName) return;

  showLoading('Criando repositório e sincronizando...');
  try {
    await github.createRepository(repoName, 'Criado via Web CMS');
    await delay(1200); // Aguarda sincronização do GitHub
    showToast('Repositório criado com sucesso!');
    await loadRepositories();
  } catch (error) {
    showToast('Erro ao criar repositório: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

// Excluir Repositório (com sincronização)
async function confirmDeleteRepo(repoName) {
  const confirmText = prompt(`Para excluir permanentemente, digite o nome do repositório (${repoName}):`);
  if (confirmText !== repoName) {
    showToast('Nome incorreto. Operação cancelada.', 'error');
    return;
  }

  showLoading('Excluindo repositório e sincronizando...');
  try {
    await github.deleteRepository(currentUser.login, repoName);
    await delay(1200); // Aguarda sincronização do GitHub
    showToast('Repositório excluído com sucesso!');
    await loadRepositories();
  } catch (error) {
    showToast('Erro ao excluir repositório: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

async function selectRepo(repoName) {
  currentRepo = repoName;
  currentRepoTitle.textContent = `Repositório: ${repoName}`;

  dashboardSection.style.display = 'none';
  editorSection.style.display = 'block';

  if (monacoEditor && !isMobile) {
    setTimeout(() => monacoEditor.layout(), 100);
  }

  currentFolderPath = '';
  await loadFiles(currentFolderPath);
}

async function loadFiles(path = '') {
  showLoading('Carregando arquivos...');
  currentPathDisplay.textContent = path ? `/${path}` : '/';

  try {
    const contents = await github.getContents(currentUser.login, currentRepo, path);
    fileTree.innerHTML = '';

    if (path !== '') {
      const backLi = document.createElement('li');
      backLi.innerHTML = '<strong>⬅️ .. (Voltar pasta)</strong>';
      backLi.style.cursor = 'pointer';
      backLi.addEventListener('click', async () => {
        const pathParts = currentFolderPath.split('/');
        pathParts.pop();
        currentFolderPath = pathParts.join('/');
        await loadFiles(currentFolderPath);
      });
      fileTree.appendChild(backLi);
    }

    contents.forEach(item => {
      const li = document.createElement('li');
      const icon = item.type === 'dir' ? '📁' : '📄';
      li.textContent = `${icon} ${item.name}`;
      li.style.cursor = 'pointer';

      if (item.type === 'dir') {
        li.addEventListener('click', async () => {
          currentFolderPath = item.path;
          await loadFiles(currentFolderPath);
        });
      } else if (item.type === 'file') {
        li.addEventListener('click', () => openFile(item.path));
      }

      fileTree.appendChild(li);
    });
  } catch (error) {
    fileTree.innerHTML = '<li>Erro ao carregar arquivos.</li>';
    showToast('Erro ao carregar estrutura de arquivos.', 'error');
  } finally {
    hideLoading();
  }
}

async function openFile(filePath) {
  showLoading('Abrindo arquivo...');

  try {
    const fileData = await github.getFile(currentUser.login, currentRepo, filePath);
    const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));

    currentFile = {
      path: fileData.path,
      sha: fileData.sha
    };

    currentFileTitle.textContent = `Arquivo: ${fileData.name}`;

    if (isMobile) {
      mobileEditor.value = decodedContent;
    } else if (monacoEditor) {
      monacoEditor.setValue(decodedContent);
      const language = getLanguageFromFilename(fileData.name);
      monaco.editor.setModelLanguage(monacoEditor.getModel(), language);
      setTimeout(() => monacoEditor.layout(), 50);
    }

    saveFileBtn.style.display = 'inline-block';
    deleteFileBtn.style.display = 'inline-block';
  } catch (error) {
    showToast('Erro ao abrir arquivo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

saveFileBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  showLoading('Salvando alterações no GitHub...');

  try {
    const newContent = isMobile ? mobileEditor.value : monacoEditor.getValue();
    const result = await github.updateFile(
      currentUser.login,
      currentRepo,
      currentFile.path,
      newContent,
      currentFile.sha
    );

    currentFile.sha = result.content.sha;
    showToast('Alterações salvas com sucesso!');
  } catch (error) {
    showToast('Erro ao salvar: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

// Criar Arquivo (com sincronização)
newFileBtn.addEventListener('click', async () => {
  const filename = prompt('Digite o nome do novo arquivo (ex: pagina.html ou css/estilo.css):');
  if (!filename) return;

  const fullPath = currentFolderPath ? `${currentFolderPath}/${filename}` : filename;

  showLoading('Criando novo arquivo e atualizando lista...');
  try {
    await github.updateFile(
      currentUser.login,
      currentRepo,
      fullPath,
      '',
      null,
      `Criado arquivo ${filename} via Web CMS`
    );

    await delay(1000); // Aguarda sincronização do GitHub
    showToast('Arquivo criado com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao criar arquivo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

// Excluir Arquivo (com sincronização)
deleteFileBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const confirmDelete = confirm(`Tem certeza que deseja excluir o arquivo "${currentFile.path}"?`);
  if (!confirmDelete) return;

  showLoading('Excluindo arquivo e atualizando lista...');
  try {
    await github.deleteFile(
      currentUser.login,
      currentRepo,
      currentFile.path,
      currentFile.sha
    );

    currentFile = null;
    if (isMobile) mobileEditor.value = '';
    else monacoEditor.setValue('// Selecione um arquivo para começar a editar...');

    saveFileBtn.style.display = 'none';
    deleteFileBtn.style.display = 'none';
    currentFileTitle.textContent = 'Nenhum arquivo selecionado';

    await delay(1000); // Aguarda sincronização do GitHub
    showToast('Arquivo excluído com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao excluir arquivo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

backToReposBtn.addEventListener('click', async () => {
  currentFile = null;
  currentFolderPath = '';
  if (isMobile) mobileEditor.value = '';
  else monacoEditor.setValue('// Selecione um arquivo para começar a editar...');

  saveFileBtn.style.display = 'none';
  deleteFileBtn.style.display = 'none';
  currentFileTitle.textContent = 'Nenhum arquivo selecionado';
  await loadRepositories();
});
