let github = null;
let currentUser = null;
let currentRepo = null;
let currentFile = null;
let originalFileContent = '';
let hasUnsavedChanges = false;
let currentFolderPath = '';
let monacoEditor = null;
let isExpanded = false;
let isDeleteMode = false;
const isMobile = window.innerWidth <= 768;

const tokenInput = document.getElementById('token-input');
const connectBtn = document.getElementById('connect-btn');
const authStatus = document.getElementById('auth-status');

const mainHeader = document.getElementById('main-header');
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
const toggleDeleteModeBtn = document.getElementById('toggle-delete-mode-btn');
const newRepoBtn = document.getElementById('new-repo-btn');

const logoutWrapper = document.getElementById('logout-wrapper');
const logoutPopover = document.getElementById('logout-popover');
const powerToggleBtn = document.getElementById('power-toggle-btn');
const logoutBtn = document.getElementById('logout-btn');

const backToReposBtn = document.getElementById('back-to-repos-btn');
const currentPathDisplay = document.getElementById('current-path-display');
const mobileEditor = document.getElementById('mobile-editor');

const previewBtn = document.getElementById('preview-btn');
const expandBtn = document.getElementById('expand-btn');
const expandIcon = document.getElementById('expand-icon');
const expandText = document.getElementById('expand-text');
const fileExplorer = document.getElementById('file-explorer');
const codeEditorArea = document.getElementById('code-editor-area');

const previewModal = document.getElementById('preview-modal');
const closePreviewBtn = document.getElementById('close-preview-btn');
const previewFrame = document.getElementById('preview-frame');

const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const toastContainer = document.getElementById('toast-container');

// SVG ÍCONES PARA RETRAIR E EXPANDIR
const expandSVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;
const retractSVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7"/></svg>`;

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

function setActionButtonVisibility(button, visible) {
  if (visible) {
    button.classList.remove('action-hidden');
    button.classList.add('action-visible');
  } else {
    button.classList.remove('action-visible');
    button.classList.add('action-hidden');
  }
}

function updateSaveButtonState(modified) {
  hasUnsavedChanges = modified;
  const labelSpan = saveFileBtn.querySelector('.btn-label');
  
  if (modified) {
    saveFileBtn.classList.remove('save-disabled');
    saveFileBtn.classList.add('save-active');
    saveFileBtn.disabled = false;
    if (labelSpan) labelSpan.textContent = '* Salvar';
  } else {
    saveFileBtn.classList.remove('save-active');
    saveFileBtn.classList.add('save-disabled');
    saveFileBtn.disabled = true;
    if (labelSpan) labelSpan.textContent = 'Salvar';
  }
}

function checkUnsavedChanges() {
  if (hasUnsavedChanges) {
    return confirm('Você possui alterações não salvas no arquivo atual. Deseja descartá-las?');
  }
  return true;
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

    monacoEditor.onDidChangeModelContent(() => {
      if (currentFile) {
        const currentContent = monacoEditor.getValue();
        updateSaveButtonState(currentContent !== originalFileContent);
      }
    });
  });
}

mobileEditor.addEventListener('input', () => {
  if (currentFile) {
    const currentContent = mobileEditor.value;
    updateSaveButtonState(currentContent !== originalFileContent);
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
    logoutWrapper.style.display = 'flex';
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
    logoutWrapper.style.display = 'flex';
    await loadRepositories();
    showToast('Conectado com sucesso!');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    hideLoading();
  }
});

powerToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isVisible = logoutPopover.classList.contains('logout-popover-visible');
  if (isVisible) {
    logoutPopover.classList.remove('logout-popover-visible');
    logoutPopover.classList.add('logout-popover-hidden');
  } else {
    logoutPopover.classList.remove('logout-popover-hidden');
    logoutPopover.classList.add('logout-popover-visible');
  }
});

document.addEventListener('click', (e) => {
  if (!logoutWrapper.contains(e.target)) {
    logoutPopover.classList.remove('logout-popover-visible');
    logoutPopover.classList.add('logout-popover-hidden');
  }
});

logoutBtn.addEventListener('click', () => {
  if (!checkUnsavedChanges()) return;
  localStorage.removeItem('gh_token');
  location.reload();
});

async function loadRepositories() {
  showLoading('Buscando repositórios...');
  repoList.innerHTML = '';
  try {
    const repos = await github.getRepositories();
    mainHeader.style.display = 'flex';
    loginSection.style.display = 'none';
    editorSection.style.display = 'none';
    dashboardSection.style.display = 'block';

    repoList.innerHTML = '';
    repos.forEach(repo => {
      const li = document.createElement('li');
      li.innerHTML = `
        <a class="repo-link" onclick="selectRepo('${repo.name}')">${repo.name}</a>
        <div>
          <button class="danger-btn" style="padding: 4px 8px; font-size: 12px;" onclick="confirmDeleteRepo('${repo.name}')" title="Excluir Repositório">✖</button>
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
  // Nome do repositório destacado em azul igual à lista principal
  currentRepoTitle.innerHTML = `Repositório: <span class="repo-highlight-title">${repoName}</span>`;

  mainHeader.style.display = 'none';
  dashboardSection.style.display = 'none';
  editorSection.style.display = 'block';

  if (monacoEditor && !isMobile) {
    setTimeout(() => monacoEditor.layout(), 100);
  }

  currentFolderPath = '';
  await loadFiles(currentFolderPath);
}

toggleDeleteModeBtn.addEventListener('click', () => {
  isDeleteMode = !isDeleteMode;
  toggleDeleteModeBtn.classList.toggle('delete-mode-active', isDeleteMode);
  showToast(isDeleteMode ? 'Modo de exclusão ativado.' : 'Modo de exclusão desativado.');
  
  const actionContainers = document.querySelectorAll('.tree-item-actions');
  actionContainers.forEach(container => {
    container.style.display = isDeleteMode ? 'flex' : 'none';
  });
});

async function loadFiles(path = '') {
  showLoading('Carregando arquivos...');
  currentPathDisplay.textContent = path ? `/${path}` : '/';
  fileTree.innerHTML = '';

  try {
    let contents = await github.getContents(currentUser.login, currentRepo, path);
    
    if (!Array.isArray(contents)) {
      contents = [];
    }

    fileTree.innerHTML = '';

    contents.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      return a.type === 'dir' ? -1 : 1;
    });

    if (path !== '') {
      const backLi = document.createElement('li');
      backLi.innerHTML = '<span class="tree-item-title is-folder">⬅️ .. (Voltar pasta)</span>';
      backLi.style.cursor = 'pointer';
      backLi.addEventListener('click', async () => {
        if (!checkUnsavedChanges()) return;
        const pathParts = currentFolderPath.split('/');
        pathParts.pop();
        currentFolderPath = pathParts.join('/');
        await loadFiles(currentFolderPath);
      });
      fileTree.appendChild(backLi);
    }

    for (const item of contents) {
      const li = document.createElement('li');
      let icon = item.type === 'dir' ? '📁' : '📄';
      const textClass = item.type === 'dir' ? 'is-folder' : 'is-file';

      li.innerHTML = `
        <span class="tree-item-title ${textClass}"><span class="item-icon">${icon}</span> <span class="item-name">${item.name}</span></span>
        <div class="tree-item-actions" style="display: ${isDeleteMode ? 'flex' : 'none'};">
          <button class="danger-btn" style="padding: 2px 6px; font-size: 11px;" title="Excluir">✖</button>
        </div>
      `;

      const titleSpan = li.querySelector('.tree-item-title');
      const deleteBtn = li.querySelector('button');

      if (item.type === 'dir') {
        github.getContents(currentUser.login, currentRepo, item.path).then(subContents => {
          const iconSpan = li.querySelector('.item-icon');
          if (iconSpan) {
            const realFiles = Array.isArray(subContents) ? subContents.filter(f => f.name !== '.gitkeep') : [];
            iconSpan.textContent = realFiles.length > 0 ? '📂' : '📁';
          }
        }).catch(() => {});

        titleSpan.addEventListener('click', async () => {
          if (!checkUnsavedChanges()) return;
          currentFolderPath = item.path;
          await loadFiles(currentFolderPath);
        });

        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteFolder(item.path, item.name);
        });

      } else if (item.type === 'file') {
        titleSpan.addEventListener('click', () => {
          if (!checkUnsavedChanges()) return;
          openFile(item.path);
        });

        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteFileByPath(item.path, item.sha);
        });
      }

      fileTree.appendChild(li);
    }
  } catch (error) {
    if (path !== '') {
      const pathParts = path.split('/');
      pathParts.pop();
      currentFolderPath = pathParts.join('/');
      await loadFiles(currentFolderPath);
    } else {
      fileTree.innerHTML = '<li>Nenhum arquivo encontrado.</li>';
      hideLoading();
    }
  } finally {
    hideLoading();
  }
}

async function deleteFolder(folderPath, folderName) {
  const confirmText = prompt(`Tem certeza que deseja excluir a pasta "${folderName}" e TODO o seu conteúdo? Digite "${folderName}" para confirmar:`);
  if (confirmText !== folderName) {
    showToast('Confirmação incorreta. Operação cancelada.', 'error');
    return;
  }

  showLoading(`Excluindo pasta ${folderName} e seus arquivos...`);
  try {
    await github.deleteFolder(currentUser.login, currentRepo, folderPath);
    showToast('Pasta excluída com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao excluir pasta: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

async function deleteFileByPath(filePath, sha) {
  const confirmDelete = confirm(`Tem certeza que deseja excluir o arquivo "${filePath}"?`);
  if (!confirmDelete) return;

  showLoading('Excluindo arquivo...');
  try {
    await github.deleteFile(currentUser.login, currentRepo, filePath, sha);

    if (currentFile && currentFile.path === filePath) {
      currentFile = null;
      originalFileContent = '';
      updateSaveButtonState(false);
      
      if (isMobile) {
        mobileEditor.value = '';
        mobileEditor.style.display = 'none';
      } else {
        monacoEditor.setValue('// Selecione um arquivo para começar a editar...');
      }

      setActionButtonVisibility(saveFileBtn, false);
      setActionButtonVisibility(deleteFileBtn, false);
      setActionButtonVisibility(expandBtn, false);
      setActionButtonVisibility(previewBtn, false);
      currentFileTitle.textContent = 'Nenhum arquivo selecionado';
    }

    showToast('Arquivo excluído com sucesso!');
    await loadFiles(currentFolderPath);

  } catch (error) {
    showToast('Erro ao excluir arquivo: ' + error.message, 'error');
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

    originalFileContent = decodedContent;
    currentFileTitle.textContent = `Arquivo: ${fileData.name}`;

    if (isMobile) {
      mobileEditor.value = decodedContent;
      mobileEditor.style.display = 'block';
    } else if (monacoEditor) {
      monacoEditor.setValue(decodedContent);
      const language = getLanguageFromFilename(fileData.name);
      monaco.editor.setModelLanguage(monacoEditor.getModel(), language);
      setTimeout(() => monacoEditor.layout(), 50);
    }

    updateSaveButtonState(false);

    setActionButtonVisibility(saveFileBtn, true);
    setActionButtonVisibility(deleteFileBtn, true);
    setActionButtonVisibility(expandBtn, true);
    setActionButtonVisibility(previewBtn, true);

    if (fileData.name.toLowerCase().endsWith('.html') || fileData.name.toLowerCase().endsWith('.htm')) {
      previewBtn.disabled = false;
      previewBtn.classList.remove('preview-disabled');
      previewBtn.classList.add('preview-active');
    } else {
      previewBtn.disabled = true;
      previewBtn.classList.remove('preview-active');
      previewBtn.classList.add('preview-disabled');
    }

  } catch (error) {
    showToast('Erro ao abrir arquivo: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

saveFileBtn.addEventListener('click', async () => {
  if (!currentFile || !hasUnsavedChanges) return;

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
    originalFileContent = newContent;
    updateSaveButtonState(false);
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
    expandIcon.innerHTML = retractSVG;
    if (expandText) expandText.textContent = 'Retrair';
  } else {
    codeEditorArea.classList.remove('fullscreen-editor');
    fileExplorer.style.display = 'block';
    expandIcon.innerHTML = expandSVG;
    if (expandText) expandText.textContent = 'Expandir';
  }

  if (monacoEditor && !isMobile) {
    setTimeout(() => monacoEditor.layout(), 50);
  }
});

previewBtn.addEventListener('click', () => {
  if (!currentFile || previewBtn.disabled) return;

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
  if (!checkUnsavedChanges()) return;

  const filename = prompt('Digite o nome do novo arquivo (ex: pagina.html):');
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

newFolderBtn.addEventListener('click', async () => {
  if (!checkUnsavedChanges()) return;

  const folderName = prompt('Digite o nome da nova pasta:');
  if (!folderName) return;

  const fullPath = currentFolderPath ? `${currentFolderPath}/${folderName}/.gitkeep` : `${folderName}/.gitkeep`;

  showLoading('Criando pasta...');
  try {
    await github.updateFile(
      currentUser.login,
      currentRepo,
      fullPath,
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
  await deleteFileByPath(currentFile.path, currentFile.sha);
});

backToReposBtn.addEventListener('click', async () => {
  if (!checkUnsavedChanges()) return;

  currentFile = null;
  originalFileContent = '';
  currentFolderPath = '';
  updateSaveButtonState(false);

  if (isExpanded) {
    isExpanded = false;
    codeEditorArea.classList.remove('fullscreen-editor');
    fileExplorer.style.display = 'block';
    expandIcon.innerHTML = expandSVG;
    if (expandText) expandText.textContent = 'Expandir';
  }

  if (isMobile) {
    mobileEditor.value = '';
    mobileEditor.style.display = 'none';
  } else {
    monacoEditor.setValue('// Selecione um arquivo para começar a editar...');
  }

  setActionButtonVisibility(saveFileBtn, false);
  setActionButtonVisibility(deleteFileBtn, false);
  setActionButtonVisibility(expandBtn, false);
  setActionButtonVisibility(previewBtn, false);
  currentFileTitle.textContent = 'Nenhum arquivo selecionado';
  await loadRepositories();
});
