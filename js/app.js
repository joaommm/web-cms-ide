let monacoEditor = null;
let currentRepoOwner = '';
let currentRepoName = '';
let currentFilePath = '';
let currentFileSha = '';
let currentTreeData = [];
let isDeleteMode = false;
let originalFileContent = '';

// SVG Icons
const ICON_CLOSE_X = `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_EXPAND = `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
const ICON_COMPRESS = `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="10" y1="14" x2="3" y2="21"></line></svg>`;
const ICON_FOLDER_EMPTY = `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="#E8EAED" stroke="#5F6368" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
const ICON_FOLDER_FULL = `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="#FFE082" stroke="#F57F17" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11h6m-6 3h4" stroke="#D78000" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_FILE = `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6e7681" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
const ICON_REPO = `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0969da" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkAuth();
  initMonacoSafely();
});

function initMonacoSafely() {
  const container = document.getElementById('monaco-container');
  if (!container) return;

  if (typeof require !== 'undefined') {
    try {
      require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' } });
      require(['vs/editor/editor.main'], () => {
        monacoEditor = monaco.editor.create(container, {
          value: '// Selecione um arquivo para editar',
          language: 'javascript',
          theme: 'vs-dark',
          automaticLayout: true
        });

        monacoEditor.onDidChangeModelContent(() => {
          checkContentChange();
        });
      }, (err) => {
        console.warn('Monaco Editor não pôde ser carregado via CDN. Modo de texto simples ativo.');
      });
    } catch (e) {
      console.warn('Erro ao inicializar Monaco Editor:', e);
    }
  }

  const mobileEditor = document.getElementById('mobile-editor');
  if (mobileEditor) {
    mobileEditor.addEventListener('input', () => {
      checkContentChange();
    });
  }
}

function showLoading(msg = 'Carregando...') {
  const loadingText = document.getElementById('loading-text');
  const overlay = document.getElementById('loading-overlay');
  if (loadingText) loadingText.innerText = msg;
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    alert(message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

async function checkAuth() {
  const token = localStorage.getItem('gh_token');
  if (token) {
    showSection('dashboard-section');
    await loadRepositories();
  } else {
    showSection('auth-section');
  }
}

function showSection(sectionId) {
  const authSec = document.getElementById('auth-section');
  const dashSec = document.getElementById('dashboard-section');
  const editSec = document.getElementById('editor-section');

  if (authSec) authSec.style.display = 'none';
  if (dashSec) dashSec.style.display = 'none';
  if (editSec) editSec.style.display = 'none';

  const target = document.getElementById(sectionId);
  if (target) target.style.display = 'block';

  const powerBtnWrapper = document.getElementById('logout-wrapper');
  if (powerBtnWrapper) {
    powerBtnWrapper.style.display = (sectionId === 'auth-section') ? 'none' : 'flex';
  }
}

function getActiveEditorContent() {
  if (window.innerWidth <= 768 || !monacoEditor) {
    const mobileEditor = document.getElementById('mobile-editor');
    return mobileEditor ? mobileEditor.value : '';
  } else {
    return monacoEditor ? monacoEditor.getValue() : '';
  }
}

function setActiveEditorContent(content) {
  if (monacoEditor) {
    monacoEditor.setValue(content);
  }
  const mobileEditor = document.getElementById('mobile-editor');
  if (mobileEditor) {
    mobileEditor.value = content;
  }
  originalFileContent = content;
  checkContentChange();
}

function checkContentChange() {
  const currentContent = getActiveEditorContent();
  const saveBtn = document.getElementById('save-file-btn');
  if (!saveBtn) return;

  if (currentContent !== originalFileContent) {
    saveBtn.classList.remove('save-disabled');
    saveBtn.classList.add('save-active');
  } else {
    saveBtn.classList.remove('save-active');
    saveBtn.classList.add('save-disabled');
  }
}

function setupEventListeners() {
  const saveTokenBtn = document.getElementById('save-token-btn');
  if (saveTokenBtn) {
    saveTokenBtn.addEventListener('click', async () => {
      const tokenInput = document.getElementById('github-token');
      const token = tokenInput ? tokenInput.value.trim() : '';
      if (!token) return showToast('Digite um token válido do GitHub', 'error');

      localStorage.setItem('gh_token', token);
      showToast('Autenticando...');
      await checkAuth();
    });
  }

  const powerBtn = document.getElementById('power-btn');
  const popover = document.getElementById('logout-popover');
  
  if (powerBtn && popover) {
    powerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popover.classList.contains('logout-popover-hidden')) {
        popover.classList.remove('logout-popover-hidden');
        popover.classList.add('logout-popover-visible');
      } else {
        popover.classList.remove('logout-popover-visible');
        popover.classList.add('logout-popover-hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== powerBtn) {
        popover.classList.remove('logout-popover-visible');
        popover.classList.add('logout-popover-hidden');
      }
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('gh_token');
      if (popover) {
        popover.classList.remove('logout-popover-visible');
        popover.classList.add('logout-popover-hidden');
      }
      showToast('Desconectado com sucesso');
      checkAuth();
    });
  }

  const backBtn = document.getElementById('back-to-repos-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showSection('dashboard-section');
      loadRepositories();
    });
  }

  const newFileBtn = document.getElementById('new-file-btn');
  if (newFileBtn) newFileBtn.addEventListener('click', handleCreateFile);

  const newFolderBtn = document.getElementById('new-folder-btn');
  if (newFolderBtn) newFolderBtn.addEventListener('click', handleCreateFolder);
  
  const toggleDeleteBtn = document.getElementById('toggle-delete-mode-btn');
  if (toggleDeleteBtn) {
    toggleDeleteBtn.addEventListener('click', () => {
      isDeleteMode = !isDeleteMode;
      if (isDeleteMode) {
        toggleDeleteBtn.classList.add('delete-mode-active');
        showToast('Modo de exclusão ativado. Clique em um item para excluir.', 'error');
      } else {
        toggleDeleteBtn.classList.remove('delete-mode-active');
        showToast('Modo de exclusão desativado.');
      }
    });
  }

  const saveFileBtn = document.getElementById('save-file-btn');
  if (saveFileBtn) saveFileBtn.addEventListener('click', handleSaveFile);

  const deleteFileBtn = document.getElementById('delete-file-btn');
  if (deleteFileBtn) deleteFileBtn.addEventListener('click', () => handleDeleteItem(currentFilePath, 'file'));

  const previewBtn = document.getElementById('preview-btn');
  if (previewBtn) previewBtn.addEventListener('click', handlePreview);

  const closePreviewBtn = document.getElementById('close-preview-btn');
  if (closePreviewBtn) {
    closePreviewBtn.addEventListener('click', () => {
      const modal = document.getElementById('preview-modal');
      if (modal) modal.style.display = 'none';
    });
  }

  const expandEditorBtn = document.getElementById('expand-editor-btn');
  if (expandEditorBtn) expandEditorBtn.addEventListener('click', toggleExpandEditor);
}

function toggleExpandEditor() {
  const container = document.getElementById('code-editor-area');
  const btn = document.getElementById('expand-editor-btn');
  if (!container || !btn) return;
  
  if (container.classList.contains('fullscreen-editor')) {
    container.classList.remove('fullscreen-editor');
    btn.innerHTML = `${ICON_EXPAND} Expandir`;
  } else {
    container.classList.add('fullscreen-editor');
    btn.innerHTML = `${ICON_COMPRESS} Restaurar`;
  }

  if (monacoEditor) {
    setTimeout(() => {
      monacoEditor.layout();
    }, 150);
  }
}

async function loadRepositories() {
  showLoading('Buscando repositórios...');
  try {
    const user = await fetchGitHub('/user');
    currentRepoOwner = user.login;

    const repos = await fetchGitHub('/user/repos?per_page=100&sort=updated');
    const repoList = document.getElementById('repo-list');
    if (!repoList) return;
    repoList.innerHTML = '';

    repos.forEach(repo => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="repo-link" data-repo="${repo.name}">
          ${ICON_REPO} ${repo.name}
        </span>
        <button class="danger-btn delete-repo-btn" data-repo="${repo.name}" title="Excluir Repositório">
          ${ICON_CLOSE_X}
        </button>
      `;
      repoList.appendChild(li);
    });

    document.querySelectorAll('.repo-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const repoName = e.currentTarget.getAttribute('data-repo');
        openRepository(repoName);
      });
    });

    document.querySelectorAll('.delete-repo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const repoName = e.currentTarget.getAttribute('data-repo');
        handleDeleteRepository(repoName);
      });
    });

  } catch (err) {
    showToast('Erro ao validar Token ou carregar dados: ' + err.message, 'error');
    localStorage.removeItem('gh_token');
    showSection('auth-section');
  } finally {
    hideLoading();
  }
}

async function handleDeleteRepository(repoName) {
  if (!confirm(`Tem certeza de que deseja excluir permanentemente o repositório "${repoName}"?`)) return;
  showLoading('Excluindo repositório...');
  try {
    await fetchGitHub(`/repos/${currentRepoOwner}/${repoName}`, 'DELETE');
    showToast(`Repositório "${repoName}" excluído com sucesso!`);
    await loadRepositories();
  } catch (err) {
    showToast('Erro ao excluir repositório: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function openRepository(repoName) {
  currentRepoName = repoName;
  currentFilePath = '';
  currentFileSha = '';
  setEditorActionsVisible(false);
  const repoTitle = document.getElementById('current-repo-title');
  if (repoTitle) repoTitle.innerText = `Repositório: ${repoName}`;
  
  showSection('editor-section');
  await loadTree();
}

async function loadTree() {
  showLoading('Carregando arquivos...');
  try {
    const branchData = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/branches/main`)
      .catch(() => fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/branches/master`));

    const treeSha = branchData.commit.commit.tree.sha;
    const treeData = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/git/trees/${treeSha}?recursive=1`);
    
    currentTreeData = treeData.tree || [];
    renderFileTree(currentTreeData);
  } catch (err) {
    showToast('Erro ao carregar árvore de arquivos: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

function renderFileTree(tree) {
  const fileTreeUI = document.getElementById('file-tree');
  if (!fileTreeUI) return;
  fileTreeUI.innerHTML = '';

  const dirSet = new Set();
  tree.forEach(item => {
    if (item.type === 'tree') {
      dirSet.add(item.path);
    }
  });

  const parentDirHasChildren = {};
  dirSet.forEach(dirPath => {
    const hasChild = tree.some(child => child.path !== dirPath && child.path.startsWith(dirPath + '/'));
    parentDirHasChildren[dirPath] = hasChild;
  });

  const folders = tree.filter(item => item.type === 'tree');
  const files = tree.filter(item => item.type === 'blob');

  folders.sort((a, b) => a.path.localeCompare(b.path));
  files.sort((a, b) => a.path.localeCompare(b.path));

  const sortedTree = [...folders, ...files];

  sortedTree.forEach(item => {
    const li = document.createElement('li');
    let icon = ICON_FILE;

    if (item.type === 'tree') {
      const hasChildren = parentDirHasChildren[item.path];
      icon = hasChildren ? ICON_FOLDER_FULL : ICON_FOLDER_EMPTY;
    }

    li.innerHTML = `
      <div class="tree-item-title">
        ${icon}
        <span>${item.path}</span>
      </div>
    `;

    li.addEventListener('click', () => {
      if (isDeleteMode) {
        handleDeleteItem(item.path, item.type === 'tree' ? 'folder' : 'file');
      } else if (item.type === 'blob') {
        loadFileContent(item.path, item.sha);
      }
    });

    fileTreeUI.appendChild(li);
  });
}

function setEditorActionsVisible(visible) {
  const actionsContainer = document.getElementById('editor-actions');
  if (!actionsContainer) return;
  if (visible) {
    actionsContainer.classList.remove('action-hidden');
    actionsContainer.classList.add('action-visible');
  } else {
    actionsContainer.classList.remove('action-visible');
    actionsContainer.classList.add('action-hidden');
  }
}

async function loadFileContent(path, sha) {
  showLoading(`Abrindo ${path}...`);
  try {
    const data = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${path}`);
    currentFilePath = path;
    currentFileSha = data.sha;

    const decoded = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
    
    const filePathLabel = document.getElementById('editing-file-path');
    if (filePathLabel) filePathLabel.innerText = `Arquivo: ${path}`;
    
    if (monacoEditor && monaco.editor) {
      const extension = path.split('.').pop().toLowerCase();
      let lang = 'plaintext';
      if (['js', 'json', 'html', 'css', 'ts', 'php', 'py', 'md', 'xml', 'sql'].includes(extension)) {
        lang = extension === 'js' ? 'javascript' : (extension === 'md' ? 'markdown' : extension);
      }
      monaco.editor.setModelLanguage(monacoEditor.getModel(), lang);
    }

    setActiveEditorContent(decoded);
    setEditorActionsVisible(true);
  } catch (err) {
    showToast('Erro ao carregar arquivo: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleSaveFile() {
  if (!currentFilePath) return;
  const content = getActiveEditorContent();
  if (content === originalFileContent) return;

  showLoading('Salvando alterações...');
  try {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const res = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${currentFilePath}`, 'PUT', {
      message: `Update ${currentFilePath} via Web CMS IDE`,
      content: encoded,
      sha: currentFileSha
    });

    currentFileSha = res.content.sha;
    originalFileContent = content;
    checkContentChange();
    showToast('Arquivo salvo com sucesso!');
    await loadTree();
  } catch (err) {
    showToast('Erro ao salvar arquivo: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleCreateFile() {
  const fileName = prompt('Digite o caminho/nome do novo arquivo (Ex: js/script.js):');
  if (!fileName) return;

  showLoading('Criando arquivo...');
  try {
    const encoded = btoa(unescape(encodeURIComponent('// Novo arquivo')));
    await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${fileName}`, 'PUT', {
      message: `Create ${fileName} via Web CMS IDE`,
      content: encoded
    });

    showToast('Arquivo criado com sucesso!');
    await loadTree();
    loadFileContent(fileName);
  } catch (err) {
    showToast('Erro ao criar arquivo: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleCreateFolder() {
  const folderName = prompt('Digite o nome da nova pasta:');
  if (!folderName) return;

  const keepFilePath = `${folderName.replace(/\/$/, '')}/.keep`;
  showLoading('Criando pasta...');
  try {
    const encoded = btoa(unescape(encodeURIComponent('')));
    await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${keepFilePath}`, 'PUT', {
      message: `Create folder ${folderName} via Web CMS IDE`,
      content: encoded
    });

    showToast('Pasta criada com sucesso!');
    await loadTree();
  } catch (err) {
    showToast('Erro ao criar pasta: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleDeleteItem(path, type = 'file') {
  if (!path) return;
  
  if (!confirm(`Tem certeza de que deseja excluir ${type === 'folder' ? 'a pasta' : 'o arquivo'} "${path}"?`)) return;

  showLoading(`Excluindo ${path}...`);
  try {
    if (type === 'file') {
      let sha = currentFileSha;
      if (path !== currentFilePath) {
        const fileData = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${path}`);
        sha = fileData.sha;
      }
      await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${path}`, 'DELETE', {
        message: `Delete ${path} via Web CMS IDE`,
        sha: sha
      });
    } else {
      const itemsToDelete = currentTreeData.filter(item => item.path === path || item.path.startsWith(path + '/'));
      for (const item of itemsToDelete) {
        if (item.type === 'blob') {
          const fileData = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${item.path}`);
          await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${item.path}`, 'DELETE', {
            message: `Delete ${item.path} via Web CMS IDE (Folder Cleanup)`,
            sha: fileData.sha
          });
        }
      }
    }

    showToast('Item excluído com sucesso!');
    
    if (path === currentFilePath || path.startsWith(currentFilePath)) {
      currentFilePath = '';
      currentFileSha = '';
      const filePathLabel = document.getElementById('editing-file-path');
      if (filePathLabel) filePathLabel.innerText = 'Selecione um arquivo';
      setActiveEditorContent('');
      setEditorActionsVisible(false);
    }

    if (isDeleteMode) {
      isDeleteMode = false;
      const toggleDeleteBtn = document.getElementById('toggle-delete-mode-btn');
      if (toggleDeleteBtn) toggleDeleteBtn.classList.remove('delete-mode-active');
    }

    await loadTree();
  } catch (err) {
    showToast('Erro ao excluir item: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handlePreview() {
  showLoading('Gerando preview do projeto...');
  try {
    const htmlFile = currentTreeData.find(item => item.path.toLowerCase() === 'index.html');
    if (!htmlFile) {
      throw new Error('Nenhum arquivo index.html encontrado na raiz do repositório.');
    }

    const htmlData = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${htmlFile.path}`);
    let htmlContent = decodeURIComponent(escape(atob(htmlData.content.replace(/\s/g, ''))));

    if (currentFilePath.toLowerCase() === 'index.html') {
      htmlContent = getActiveEditorContent();
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const cssLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of cssLinks) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
        const cleanPath = resolveRelativePath('', href);
        try {
          let cssContent = '';
          if (cleanPath === currentFilePath) {
            cssContent = getActiveEditorContent();
          } else {
            const cssData = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${cleanPath}`);
            cssContent = decodeURIComponent(escape(atob(cssData.content.replace(/\s/g, ''))));
          }
          const style = doc.createElement('style');
          style.textContent = cssContent;
          link.parentNode.replaceChild(style, link);
        } catch (e) {
          console.warn(`Não foi possível embutir o CSS: ${cleanPath}`);
        }
      }
    }

    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src && !src.startsWith('http://') && !src.startsWith('https://')) {
        const cleanPath = resolveRelativePath('', src);
        try {
          let jsContent = '';
          if (cleanPath === currentFilePath) {
            jsContent = getActiveEditorContent();
          } else {
            const jsData = await fetchGitHub(`/repos/${currentRepoOwner}/${currentRepoName}/contents/${cleanPath}`);
            jsContent = decodeURIComponent(escape(atob(jsData.content.replace(/\s/g, ''))));
          }
          const newScript = doc.createElement('script');
          newScript.textContent = jsContent;
          script.parentNode.replaceChild(newScript, script);
        } catch (e) {
          console.warn(`Não foi possível embutir o JS: ${cleanPath}`);
        }
      }
    }

    const previewFrame = document.getElementById('preview-frame');
    const modal = document.getElementById('preview-modal');
    if (previewFrame) previewFrame.srcdoc = doc.documentElement.outerHTML;
    if (modal) modal.style.display = 'flex';

  } catch (err) {
    showToast('Erro ao carregar preview: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

function resolveRelativePath(base, relative) {
  const stack = base.split('/').filter(p => p.length > 0);
  if (stack.length > 0) stack.pop();
  const parts = relative.split('/');
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

async function fetchGitHub(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('gh_token');
  if (!token) throw new Error('Token do GitHub não encontrado.');

  const options = {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`https://api.github.com${endpoint}`, options);
  
  if (response.status === 204) return true;

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Erro ao comunicar com o GitHub. Verifique seu token.');
  }

  return data;
}
