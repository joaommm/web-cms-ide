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

// FILA ASSÍNCRONA E CONTROLE DE DEPLOY
let saveQueue = [];
let isProcessingQueue = false;
let activeDeploySession = 0;
let activeFilesCount = 0;

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
const retractSVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M3 21l7-7"/></svg>`;

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
      if (toast.parentNode) toast.remove();
    }, duration);
  }

  return toast;
}

// SALVA E LIMPA O ESTADO DO DEPLOY NO NAVEGADOR
function saveDeployState(repo, fileName, status) {
  const state = { repo, fileName, status, timestamp: Date.now() };
  localStorage.setItem('active_github_deploy', JSON.stringify(state));
}

function clearDeployState() {
  localStorage.removeItem('active_github_deploy');
}

// CHECA SE HÁ DEPLOY ATIVO APÓS ATUALIZAR A PÁGINA
async function checkOngoingDeployOnLoad() {
  const savedStateStr = localStorage.getItem('active_github_deploy');
  if (!savedStateStr || !github || !currentUser || !currentRepo) return;

  try {
    const savedState = JSON.parse(savedStateStr);
    if (savedState.repo !== currentRepo) return;

    if (Date.now() - savedState.timestamp < 600000) {
      const toastRef = showToast(`🔍 Detectado processo anterior em <b>${savedState.fileName}</b>. Verificando status no GitHub...`, 'info', 0);
      activeFilesCount = 1;
      activeDeploySession++;
      
      monitorPageDeploymentForFile(savedState.fileName, activeDeploySession, toastRef);
    } else {
      clearDeployState();
    }
  } catch (e) {
    clearDeployState();
  }
}

// MONITORAMENTO INDIVIDUAL DE CADA ARQUIVO SALVO
async function monitorPageDeploymentForFile(fileName, sessionId, toastRef) {
  if (!github || !currentUser || !currentRepo) return;

  saveDeployState(currentRepo, fileName, 'building');

  try {
    const isPagesEnabled = await github.checkPagesEnabled(currentUser.login, currentRepo);

    if (!isPagesEnabled) {
      if (toastRef) {
        toastRef.className = 'toast success';
        toastRef.innerHTML = `💾 Alteração em <b>${fileName}</b> salva no repositório!`;
        setTimeout(() => toastRef.remove(), 4000);
      }
      activeFilesCount = Math.max(0, activeFilesCount - 1);
      clearDeployState();
      return;
    }

    if (toastRef) {
      toastRef.className = 'toast info';
      toastRef.innerHTML = `🚀 <b>${fileName}</b> enviado. Verificando fila de publicação do GitHub Pages...`;
    }

    await github.trackPageDeployment(currentUser.login, currentRepo, (statusMsg) => {
      if (sessionId !== activeDeploySession || saveQueue.length > 0) {
        if (toastRef) {
          const nextFile = saveQueue.length > 0 ? saveQueue[0].file.name : 'versão mais recente';
          toastRef.innerHTML = `⏸️ <b>${fileName}</b> interrompido: assumindo <b>${nextFile}</b>...`;
        }
        return;
      }
      if (toastRef) toastRef.innerHTML = `🚀 <b>${fileName}</b>: ${statusMsg}`;
    });

    // Se houve nova alteração durante a espera do build, cancela a sincronização desta sessão antiga
    if (sessionId !== activeDeploySession) {
      if (toastRef && toastRef.parentNode) toastRef.remove();
      return;
    }

    if (toastRef) {
      toastRef.innerHTML = `⏳ <b>${fileName}</b>: Build concluído. Aguardando propagação nos servidores...`;
    }

    for (let i = 9; i > 0; i--) {
      if (sessionId !== activeDeploySession || saveQueue.length > 0) {
        if (toastRef && toastRef.parentNode) toastRef.remove();
        return;
      }
      if (toastRef) {
        toastRef.innerHTML = `⏳ <b>${fileName}</b>: Sincronizando alterações (${i}s)...`;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    clearDeployState();

    if (!isAutoReloadEnabled) {
      if (toastRef) {
        toastRef.className = 'toast success';
        toastRef.innerHTML = `✨ <b>${fileName}</b> publicado no servidor! As alterações já estão disponíveis.`;
        setTimeout(() => toastRef.remove(), 7000);
      }
      activeFilesCount = Math.max(0, activeFilesCount - 1);
      return;
    }

    while (sessionId !== activeDeploySession || saveQueue.length > 0 || isProcessingQueue) {
      if (sessionId !== activeDeploySession) {
        if (toastRef && toastRef.parentNode) toastRef.remove();
        return;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    // CONTAGEM REGRESSIVA SEGURA E CANCELAMENTO VIA LISTENER DOM
    let countdown = 5;
    let reloadCanceled = false;
    const isMultipleFiles = activeFilesCount > 1;

    const countdownInterval = setInterval(() => {
      if (reloadCanceled || sessionId !== activeDeploySession) {
        clearInterval(countdownInterval);
        if (sessionId !== activeDeploySession && toastRef && toastRef.parentNode) {
          toastRef.remove();
        }
        return;
      }

      if (countdown > 0) {
        if (toastRef) {
          toastRef.className = 'toast success';
          
          const textPart = isMultipleFiles 
            ? `✨ Todos os arquivos foram publicados!` 
            : `✨ <b>${fileName}</b> foi publicado com sucesso!`;

          toastRef.innerHTML = `
            <div>
              ${textPart}<br>
              <small>🔄 Recarregando a página em <b>${countdown}s</b>...</small>
            </div>
            <button class="toast-cancel-btn" style="margin-top:6px; padding:3px 10px; font-size:11px; font-weight:bold; border:1px solid rgba(255,255,255,0.7); background:rgba(0,0,0,0.3); color:#fff; border-radius:4px; cursor:pointer;">Cancelar Atualização</button>
          `;

          const cancelBtn = toastRef.querySelector('.toast-cancel-btn');
          if (cancelBtn) {
            cancelBtn.onclick = (e) => {
              e.stopPropagation();
              reloadCanceled = true;
              clearInterval(countdownInterval);
              toastRef.className = 'toast success';
              toastRef.innerHTML = `✨ <b>${fileName}</b> foi publicado! <br><small>🚫 Atualização automática desta alteração foi cancelada.</small>`;
              activeFilesCount = Math.max(0, activeFilesCount - 1);
              setTimeout(() => toastRef.remove(), 5000);
            };
          }
        }
        countdown--;
      } else {
        clearInterval(countdownInterval);
        if (toastRef) toastRef.innerHTML = '🔄 Recarregando a página agora...';
        
        activeFilesCount = 0;
        const cleanPath = window.location.pathname;
        window.location.href = `${cleanPath}?_nocache=${Date.now()}`;
      }
    }, 1000);

  } catch (error) {
    clearDeployState();
    if (toastRef) {
      toastRef.className = 'toast error';
      toastRef.innerHTML = `⚠️ Instabilidade ao monitorar GitHub: <b>${error.message || 'Erro de conexão'}</b>. A alteração mais recente foi salva no repositório!`;
      setTimeout(() => toastRef.remove(), 8000);
    }
    activeFilesCount = Math.max(0, activeFilesCount - 1);
  }
}

// GERENCIADOR DE FILA COM LÓGICA DE OVERRIDE (SUBSTITUIÇÃO DE VERSÃO)
function queueSaveRequest(fileObj, content) {
  activeDeploySession++;
  
  // Verifica se o mesmo arquivo já está na fila aguardando processamento
  const existingIndex = saveQueue.findIndex(item => item.file.path === fileObj.path);

  if (existingIndex !== -1) {
    // Remove a versão antiga da fila e apaga a notificação anterior
    const oldItem = saveQueue.splice(existingIndex, 1)[0];
    if (oldItem.toastRef && oldItem.toastRef.parentNode) {
      oldItem.toastRef.remove();
    }
  } else {
    activeFilesCount++;
  }

  const thisSessionId = activeDeploySession;
  const toastRef = showToast(`⏳ <b>${fileObj.name}</b>: Versão mais recente adicionada à fila...`, 'info', 0);

  saveQueue.push({
    file: fileObj,
    content: content,
    sessionId: thisSessionId,
    toastRef: toastRef
  });

  processSaveQueue();
}

async function processSaveQueue() {
  if (isProcessingQueue || saveQueue.length === 0) return;

  isProcessingQueue = true;
  const currentItem = saveQueue[0];
  const { file, content, sessionId, toastRef } = currentItem;

  if (toastRef) {
    toastRef.innerHTML = `⚙️ Enviando a versão mais recente de <b>${file.name}</b> ao GitHub...`;
  }

  try {
    // Sempre busca o SHA atual do arquivo direto no servidor antes de atualizar
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

  } catch (error) {
    if (toastRef) {
      toastRef.className = 'toast error';
      toastRef.innerHTML = `❌ Erro ao salvar <b>${file.name}</b>: ${error.message}`;
      setTimeout(() => toastRef.remove(), 6000);
    }
    activeFilesCount = Math.max(0, activeFilesCount - 1);
  } finally {
    saveQueue.shift();
    isProcessingQueue = false;

    loadFiles(currentFolderPath);
    monitorPageDeploymentForFile(file.name, sessionId, toastRef);

    if (saveQueue.length > 0) {
      processSaveQueue();
    }
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
  clearDeployState();
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
  
  checkOngoingDeployOnLoad();
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
