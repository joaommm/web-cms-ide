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
let isDarkMode = false;
let isAutoReloadEnabled = true;
const isMobile = window.innerWidth <= 768;

// FILA ASSÍNCRONA DE REQUISIÇÕES (QUEUE)
const saveQueue = [];
let isProcessingQueue = false;

const tokenInput = document.getElementById('token-input');
const connectBtn = document.getElementById('connect-btn');

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

const loginHeaderTools = document.getElementById('login-header-tools');
const headerActionsWrapper = document.getElementById('header-actions-wrapper');

// CONFIGURAÇÃO E LOGOUT
const settingsWrapper = document.getElementById('settings-wrapper');
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const settingsPopover = document.getElementById('settings-popover');
const popoverThemeBtn = document.getElementById('popover-theme-btn');
const popoverAutoReloadBtn = document.getElementById('popover-autoreload-btn');

const logoutWrapper = document.getElementById('logout-wrapper');
const logoutPopover = document.getElementById('logout-popover');
const powerToggleBtn = document.getElementById('power-toggle-btn');
const logoutBtn = document.getElementById('logout-btn');

const loginThemeBtn = document.getElementById('login-theme-btn');

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

function showLoading(message = 'Carregando...') {
  loadingMessage.textContent = message;
  loadingOverlay.style.display = 'flex';
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
}

function showToast(message, type = 'success', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  toastContainer.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  return toast;
}

// MONITORAMENTO DO DEPLOY DO GITHUB PAGES E RECARREGAMENTO COM VERIFICAÇÃO DE FILA
async function monitorPageDeployment() {
  if (!github || !currentUser || !currentRepo) return;

  // SE AINDA EXISTEM ARQUIVOS PENDENTES NA FILA, ADIA O RELOAD
  if (saveQueue.length > 0) {
    showToast(`⏳ Salvo com sucesso! Aguardando a conclusão dos demais arquivos na fila para reiniciar...`, 'info', 4000);
    return;
  }

  try {
    const isPagesEnabled = await github.checkPagesEnabled(currentUser.login, currentRepo);

    if (!isPagesEnabled) {
      showToast('💾 Alterações salvas no repositório!', 'info', 5000);
      return;
    }

    const toast = showToast('🚀 Alteração enviada. Verificando publicação no GitHub Pages...', 'info', 0);

    await github.trackPageDeployment(currentUser.login, currentRepo, (statusMsg) => {
      // SE NOVOS ARQUIVOS ENTRARAM NA FILA DURANTE A VERIFICAÇÃO
      if (saveQueue.length > 0) {
        toast.innerHTML = '⏸️ Novas alterações pendentes na fila. Aguardando conclusão...';
        return;
      }
      toast.innerHTML = statusMsg;
    });

    // SE NOVOS ARQUIVOS FORAM ADICIONADOS NA FILA ENQUANTO ROLAVA O MONITORAMENTO
    if (saveQueue.length > 0) {
      toast.remove();
      showToast('⏳ Aguardando conclusão do salvamento dos novos arquivos para reiniciar...', 'info', 4000);
      return;
    }

    toast.innerHTML = '🔄 Finalizando sincronização nos servidores...';
    await new Promise(r => setTimeout(r, 5000));

    // VERIFICAÇÃO FINAL ANTES DE DISPARAR O CONTADOR
    if (saveQueue.length > 0) {
      toast.remove();
      showToast('⏳ Aguardando conclusão do salvamento dos novos arquivos para reiniciar...', 'info', 4000);
      return;
    }

    if (!isAutoReloadEnabled) {
      toast.className = 'toast success';
      toast.innerHTML = '✨ Site publicado com sucesso!';
      setTimeout(() => toast.remove(), 6000);
      return;
    }

    let countdown = 3;
    toast.className = 'toast success';

    const countdownInterval = setInterval(() => {
      // CANCELA O RELOAD CASO UM NOVO ARQUIVO SEJA ADICIONADO NO MEIO DA CONTAGEM
      if (saveQueue.length > 0) {
        clearInterval(countdownInterval);
        toast.remove();
        showToast('⏳ Nova requisição identificada! Reinicialização pausada até concluir a fila.', 'info', 4000);
        return;
      }

      if (countdown > 0) {
        toast.innerHTML = `✨ Site publicado! <br><small>🔄 Recarregando a aplicação em <b>${countdown}s</b>...</small>`;
        countdown--;
      } else {
        clearInterval(countdownInterval);
        toast.innerHTML = '🔄 Recarregando agora...';
        
        // FORÇAR BYPASS DE CACHE COM TIMESTAMP NA URL
        const cleanPath = window.location.pathname;
        window.location.href = `${cleanPath}?_nocache=${Date.now()}`;
      }
    }, 1000);

  } catch (error) {
    showToast('💾 Alteração gravada no repositório com sucesso!', 'success', 5000);
  }
}

// TOGGLE DO AUTO-RELOAD NAS CONFIGURAÇÕES
function toggleAutoReload() {
  isAutoReloadEnabled = !isAutoReloadEnabled;
  localStorage.setItem('auto_reload', isAutoReloadEnabled ? 'true' : 'false');
  updateAutoReloadUI();
  showToast(isAutoReloadEnabled ? 'Atualização automática ativada!' : 'Atualização automática desativada.', 'info', 3000);
}

function updateAutoReloadUI() {
  if (popoverAutoReloadBtn) {
    popoverAutoReloadBtn.textContent = isAutoReloadEnabled ? '🔄 Ativado' : '⏸️ Desativado';
  }
}

popoverAutoReloadBtn.addEventListener('click', toggleAutoReload);

// TEMA DA PÁGINA
function toggleTheme() {
  isDarkMode = !isDarkMode;
  if (isDarkMode) {
    document.body.classList.add('dark-mode');
    loginThemeBtn.textContent = '☀️';
    popoverThemeBtn.textContent = '☀️ Claro';
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    loginThemeBtn.textContent = '🌙';
    popoverThemeBtn.textContent = '🌙 Escuro';
    localStorage.setItem('theme', 'light');
  }
}

loginThemeBtn.addEventListener('click', toggleTheme);
popoverThemeBtn.addEventListener('click', toggleTheme);

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

// INICIALIZAÇÃO DO EDITOR MONACO
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
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    isDarkMode = false;
    toggleTheme();
  }

  const savedAutoReload = localStorage.getItem('auto_reload');
  if (savedAutoReload !== null) {
    isAutoReloadEnabled = savedAutoReload === 'true';
  }
  updateAutoReloadUI();

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
    loginHeaderTools.style.display = 'none';
    headerActionsWrapper.style.display = 'flex';

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
    loginHeaderTools.style.display = 'none';
    headerActionsWrapper.style.display = 'flex';
    await loadRepositories();
    showToast('Conectado com sucesso!');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    hideLoading();
  }
});

// POPOVERS
settingsToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  logoutPopover.classList.remove('popover-visible');
  logoutPopover.classList.add('popover-hidden');

  const isVisible = settingsPopover.classList.contains('popover-visible');
  if (isVisible) {
    settingsPopover.classList.remove('popover-visible');
    settingsPopover.classList.add('popover-hidden');
  } else {
    settingsPopover.classList.remove('popover-hidden');
    settingsPopover.classList.add('popover-visible');
  }
});

powerToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPopover.classList.remove('popover-visible');
  settingsPopover.classList.add('popover-hidden');

  const isVisible = logoutPopover.classList.contains('popover-visible');
  if (isVisible) {
    logoutPopover.classList.remove('popover-visible');
    logoutPopover.classList.add('popover-hidden');
  } else {
    logoutPopover.classList.remove('popover-hidden');
    logoutPopover.classList.add('popover-visible');
  }
});

document.addEventListener('click', (e) => {
  if (!settingsWrapper.contains(e.target)) {
    settingsPopover.classList.remove('popover-visible');
    settingsPopover.classList.add('popover-hidden');
  }
  if (!logoutWrapper.contains(e.target)) {
    logoutPopover.classList.remove('popover-visible');
    logoutPopover.classList.add('popover-hidden');
  }
});

logoutBtn.addEventListener('click', () => {
  if (!checkUnsavedChanges()) return;
  localStorage.removeItem('gh_token');
  window.location.href = window.location.pathname;
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

  showLoading('Criando repositório...');
  try {
    await github.createRepository(repoName, 'Criado via Web CMS');
    showToast('Repositório criado com sucesso!');
    await loadRepositories();
  } catch (error) {
    showToast('Erro ao criar repositório: ' + error.message, 'error');
    hideLoading();
  }
});

async function confirmDeleteRepo(repoName) {
  const confirmText = prompt(`Para excluir permanentemente, digite o nome do repositório (${repoName}):`);
  if (confirmText !== repoName) {
    showToast('Nome incorreto. Operação cancelada.', 'error');
    return;
  }

  showLoading('Excluindo repositório...');
  try {
    await github.deleteRepository(currentUser.login, repoName);
    showToast('Repositório excluído com sucesso!');
    await loadRepositories();
  } catch (error) {
    showToast('Erro ao excluir repositório: ' + error.message, 'error');
    hideLoading();
  }
}

async function selectRepo(repoName) {
  currentRepo = repoName;
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
    if (isDeleteMode) {
      container.classList.add('visible-action');
    } else {
      container.classList.remove('visible-action');
    }
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
        <div class="tree-item-actions ${isDeleteMode ? 'visible-action' : ''}">
          <button class="danger-btn" title="Excluir">✖</button>
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

  showLoading(`Excluindo pasta ${folderName}...`);
  try {
    await github.deleteFolder(currentUser.login, currentRepo, folderPath);
    showToast('Pasta excluída com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao excluir pasta: ' + error.message, 'error');
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
      currentFileTitle.innerHTML = 'Nenhum arquivo selecionado';
    }

    showToast('Arquivo excluído com sucesso!');
    await loadFiles(currentFolderPath);

  } catch (error) {
    showToast('Erro ao excluir arquivo: ' + error.message, 'error');
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
    currentFileTitle.innerHTML = `<span class="file-title-label">Arquivo:</span> <span class="file-title-normal">${fileData.name}</span>`;

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

// FILA ASSÍNCRONA DE SALVAMENTO DE ARQUIVOS
function queueSaveRequest(fileObj, content) {
  saveQueue.push({ file: fileObj, content: content });
  
  if (saveQueue.length > 1) {
    showToast(`⏳ Salvamento de <b>${fileObj.name}</b> adicionado à fila (${saveQueue.length} na fila)`, 'info', 2500);
  }
  
  processSaveQueue();
}

async function processSaveQueue() {
  if (isProcessingQueue || saveQueue.length === 0) return;

  isProcessingQueue = true;
  const currentItem = saveQueue[0];
  const { file, content } = currentItem;
  
  const totalPending = saveQueue.length;
  const queueStatusToast = showToast(`⚙️ Enviando <b>${file.name}</b> (${totalPending} pendente${totalPending > 1 ? 's' : ''})...`, 'info', 0);

  try {
    const latestFileData = await github.getFile(currentUser.login, currentRepo, file.path);
    
    const result = await github.updateFile(
      currentUser.login,
      currentRepo,
      file.path,
      content,
      latestFileData.sha
    );

    if (currentFile && currentFile.path === file.path) {
      currentFile.sha = result.content.sha;
      originalFileContent = content;
      updateSaveButtonState(false);
    }

    queueStatusToast.remove();
    
    // NOTIFICAÇÃO DE SUCESSO INDIVIDUAL
    if (saveQueue.length > 1) {
      showToast(`✅ Arquivo <b>${file.name}</b> salvo! Aguardando demais arquivos da fila...`, 'info', 3000);
    } else {
      showToast(`✅ Arquivo <b>${file.name}</b> salvo com sucesso!`, 'success', 3000);
    }
    
  } catch (error) {
    queueStatusToast.remove();
    showToast(`❌ Erro ao salvar <b>${file.name}</b>: ${error.message}`, 'error', 5000);
  } finally {
    saveQueue.shift();
    isProcessingQueue = false;

    if (saveQueue.length > 0) {
      processSaveQueue();
    } else {
      await loadFiles(currentFolderPath);
      monitorPageDeployment();
    }
  }
}

saveFileBtn.addEventListener('click', () => {
  if (!currentFile || !hasUnsavedChanges) return;

  const newContent = isMobile ? mobileEditor.value : monacoEditor.getValue();
  const fileToSave = { ...currentFile };
  
  updateSaveButtonState(false);
  queueSaveRequest(fileToSave, newContent);
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

// CRIAÇÃO RÁPIDA DE ARQUIVO
newFileBtn.addEventListener('click', async () => {
  if (!checkUnsavedChanges()) return;

  const filename = prompt('Digite o nome do novo arquivo (ex: pagina.html):');
  if (!filename) return;

  const fullPath = currentFolderPath ? `${currentFolderPath}/${filename}` : filename;

  showLoading('Criando arquivo...');
  try {
    await github.updateFile(
      currentUser.login,
      currentRepo,
      fullPath,
      '',
      null,
      `Criado arquivo ${filename} via Web CMS`
    );

    showToast('Arquivo criado com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao criar arquivo: ' + error.message, 'error');
    hideLoading();
  }
});

// CRIAÇÃO RÁPIDA DE PASTA
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

    showToast('Pasta criada com sucesso!');
    await loadFiles(currentFolderPath);
  } catch (error) {
    showToast('Erro ao criar pasta: ' + error.message, 'error');
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
  currentFileTitle.innerHTML = 'Nenhum arquivo selecionado';
  await loadRepositories();
});
