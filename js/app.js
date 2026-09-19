let github = null;
let currentUser = null;
let currentRepo = null;
let currentFile = null;
let currentFolderPath = '';
let monacoEditor = null;
let isExpanded = false;
let originalContent = '';
let isDirty = false;
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
const newFolderBtn = document.getElementById('new-folder-btn');
const newRepoBtn = document.getElementById('new-repo-btn');
const logoutBtn = document.getElementById('logout-btn');
const backToReposBtn = document.getElementById('back-to-repos-btn');
const currentPathDisplay = document.getElementById('current-path-display');
const mobileEditor = document.getElementById('mobile-editor');

const previewBtn = document.getElementById('preview-btn');
const expandBtn = document.getElementById('expand-btn');
const fileExplorer = document.getElementById('file-explorer');
const codeEditorArea = document.getElementById('code-editor-area');

const previewModal = document.getElementById('preview-modal');
const closePreviewBtn = document.getElementById('close-preview-btn');
const previewFrame = document.getElementById('preview-frame');

const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const toastContainer = document.getElementById('toast-container');

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

function setUnsavedStatus(dirty) {
  isDirty = dirty;
  if (!currentFile) return;

  if (isDirty) {
    currentFileTitle.textContent = `Arquivo: ${currentFile.name} *`;
    saveFileBtn.disabled = false;
    saveFileBtn.classList.remove('btn-disabled');
  } else {
    currentFileTitle.textContent = `Arquivo: ${currentFile.name}`;
    saveFileBtn.disabled = true;
    saveFileBtn.classList.add('btn-disabled');
  }
}

function checkCurrentContent() {
  if (!currentFile) return;
  const currentVal = isMobile ? mobileEditor.value : monacoEditor.getValue();
  setUnsavedStatus(currentVal !== originalContent);
}

function confirmDiscardChanges() {
  if (isDirty) {
    return confirm('Você tem alterações NÃO SALVAS no arquivo atual. Deseja descartá-las?');
  }
  return true;
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

    monacoEditor.onDidChangeModelContent(() => {
      checkCurrentContent();
    });
  });
}

mobileEditor.addEventListener('input', () => {
  checkCurrentContent();
});

window.addEventListener('beforeunload', (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

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
  if (!confirmDiscardChanges()) return;
  localStorage.removeItem('gh_token');
  location.reload();
});

async function loadRepositories() {
  showLoading('Buscando repositórios...');
  repoList.innerHTML = '';
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

newRepoBtn.addEventListener('click', async () => {
  const repoName = prompt('Digite o nome do novo repositório:');
  if (!repoName) return;

  showLoading('Criando e atualizando lista...');
  try {
    await github.createRepository(repoName, 'Criado via Web CMS');
    let attempts = 0;
    let found = false;
    while (attempts < 4 && !found) {
      await delay(1000);
      const repos = await github.getRepositories();
      if (repos.some(r => r.name.toLowerCase() === repoName.toLowerCase())) {
        found = true;
      }
      attempts++;
    }

    showToast('Repositório criado com sucesso!');
    await loadRepositories();
  } catch (error) {
    showToast('Erro ao criar repositório: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

async function confirmDeleteRepo(repoName) {
  const confirmText = prompt(`Para excluir permanentemente, digite o nome do repositório (${repoName}):`);
  if (confirmText !== repoName) {
    showToast('Nome incorreto. Operação cancelada.', 'error');
    return;
  }

  showLoading('Excluindo e atualizando...');
  try {
    await github.deleteRepository(currentUser.login, repoName);
    let attempts = 0;
    let removed = false;
    while (attempts < 4 && !removed) {
      await delay(1000);
      const repos = await github.getRepositories();
      if (!repos.some(r => r.name.toLowerCase() === repoName.toLowerCase())) {
        removed = true;
      }
      attempts++;
    }

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
  fileTree.innerHTML = '';

  try {
    const contents = await github.getContents(currentUser.login, currentRepo, path);
    fileTree.innerHTML = '';

    if (path !== '') {
      const backLi = document.createElement('li');
      backLi.innerHTML = '<strong>⬅️ .. (Voltar pasta)</strong>';
      backLi.style.cursor = 'pointer';
      backLi.addEventListener('click', async () => {
        if (!confirmDiscardChanges()) return;
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
          if (!confirmDiscardChanges()) return;
          currentFolderPath = item.path;
          await loadFiles(currentFolderPath);
        });
      } else if (item.type === 'file') {
        li.addEventListener('click', () => {
          if (!confirmDiscardChanges()) return;
          openFile(item.path);
        });
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
      sha: fileData.sha,
      name: fileData.name
    };

    originalContent = decodedContent;

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
    expandBtn.style.display = 'inline-block';

    setUnsavedStatus(false);

    if (fileData.name.toLowerCase().endsWith('.html') || fileData.name.toLowerCase().endsWith('.htm')) {
      previewBtn.style.display = 'inline-block';
    } else {
      previewBtn.style.display = 'none';
    }
  } catch (error) {
    showToast('Erro ao abrir arquivo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

saveFileBtn.addEventListener('click', async () => {
  if (!currentFile || !isDirty) return;

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
    originalContent = newContent;
    setUnsavedStatus(false);
    showToast('Alterações salvas com sucesso!');
  } catch (error) {
    showToast('Erro ao salvar: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

expandBtn.addEventListener('click', () => {
  isExpanded = !isExpanded;

  if (isExpanded) {
    codeEditorArea.classList.add('fullscreen-editor');
    fileExplorer.style.display = 'none';
    expandBtn.textContent = '🗗 Retrair';
  } else {
    codeEditorArea.classList.remove('fullscreen-editor');
    fileExplorer.style.display = 'block';
    expandBtn.textContent = '⛶ Expandir';
  }

  if (monacoEditor && !isMobile) {
    setTimeout(() => monacoEditor.layout(), 100);
  }
});

previewBtn.addEventListener('click', () => {
  if (!currentFile) return;

  const content = isMobile ? mobileEditor.value : monacoEditor.getValue();
  previewModal.style.display = 'flex';

  const doc = previewFrame.contentWindow.document;
  doc.open();
  doc.write(content);
  doc.close();
});

closePreviewBtn.addEventListener('click', () => {
  previewModal.style.display = 'none';
});

newFileBtn.addEventListener('click', async () => {
  if (!confirmDiscardChanges()) return;

  const filename = prompt('Digite o nome do novo arquivo (ex: pagina.html ou estilo.css):');
  if (!filename) return;

  const fullPath = currentFolderPath ? `${currentFolderPath}/${filename}` : filename;

  showLoading('Criando arquivo e atualizando...');
  try {
    await github.updateFile(
      currentUser.login,
      currentRepo,
      fullPath,
      '',
      null,
      `Criado arquivo ${filename} via Web CMS`
    );

    let attempts = 0;
    let found = false;
    while (attempts < 4 && !found) {
      await delay(1000);
      const contents = await github.getContents(currentUser.login, currentRepo, currentFolderPath);
      if (Array.isArray(contents) && contents.some(c => c.name.toLowerCase() === filename.toLowerCase())) {
        found = true;
      }
      attempts++;
    }

    showToast('Arquivo criado com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao criar arquivo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

// Criar Nova Pasta
newFolderBtn.addEventListener('click', async () => {
  if (!confirmDiscardChanges()) return;

  const folderName = prompt('Digite o nome da nova pasta (ex: imagens ou css):');
  if (!folderName) return;

  // No Git, pastas só existem com conteúdo. Criamos um arquivo oculto .gitkeep na pasta.
  const gitkeepPath = currentFolderPath ? `${currentFolderPath}/${folderName}/.gitkeep` : `${folderName}/.gitkeep`;

  showLoading('Criando pasta...');
  try {
    await github.updateFile(
      currentUser.login,
      currentRepo,
      gitkeepPath,
      '',
      null,
      `Criada pasta ${folderName} via Web CMS`
    );

    let attempts = 0;
    let found = false;
    while (attempts < 4 && !found) {
      await delay(1000);
      const contents = await github.getContents(currentUser.login, currentRepo, currentFolderPath);
      if (Array.isArray(contents) && contents.some(c => c.name.toLowerCase() === folderName.toLowerCase())) {
        found = true;
      }
      attempts++;
    }

    showToast('Pasta criada com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao criar pasta: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

deleteFileBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const confirmDelete = confirm(`Tem certeza que deseja excluir o arquivo "${currentFile.path}"?`);
  if (!confirmDelete) return;

  showLoading('Excluindo arquivo e atualizando...');
  try {
    await github.deleteFile(
      currentUser.login,
      currentRepo,
      currentFile.path,
      currentFile.sha
    );

    currentFile = null;
    originalContent = '';
    isDirty = false;

    if (isMobile) mobileEditor.value = '';
    else monacoEditor.setValue('// Selecione um arquivo para começar a editar...');

    saveFileBtn.style.display = 'none';
    deleteFileBtn.style.display = 'none';
    expandBtn.style.display = 'none';
    previewBtn.style.display = 'none';
    currentFileTitle.textContent = 'Nenhum arquivo selecionado';

    let attempts = 0;
    let removed = false;
    while (attempts < 4 && !removed) {
      await delay(1000);
      const contents = await github.getContents(currentUser.login, currentRepo, currentFolderPath);
      if (Array.isArray(contents) && !contents.some(c => c.path === currentFile?.path)) {
        removed = true;
      }
      attempts++;
    }

    showToast('Arquivo excluído com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao excluir arquivo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
});

backToReposBtn.addEventListener('click', async () => {
  if (!confirmDiscardChanges()) return;

  currentFile = null;
  currentFolderPath = '';
  originalContent = '';
  isDirty = false;

  if (isExpanded) {
    isExpanded = false;
    codeEditorArea.classList.remove('fullscreen-editor');
    fileExplorer.style.display = 'block';
    expandBtn.textContent = '⛶ Expandir';
  }

  if (isMobile) mobileEditor.value = '';
  else monacoEditor.setValue('// Selecione um arquivo para começar a editar...');

  saveFileBtn.style.display = 'none';
  deleteFileBtn.style.display = 'none';
  expandBtn.style.display = 'none';
  previewBtn.style.display = 'none';
  currentFileTitle.textContent = 'Nenhum arquivo selecionado';
  await loadRepositories();
});
