// Estado da Aplicação
const state = {
  token: '',
  user: null,
  currentRepo: null,
  currentBranch: 'main',
  currentPath: '',
  files: [],
  selectedFile: null,
  editor: null,
  isDeleteMode: false,
  fileToDelete: null
};

// SVG Icons
const ICONS = {
  power: `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>`,
  preview: `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  expand: `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`,
  shrink: `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="10" y1="14" x2="3" y2="21"></line></svg>`,
  delete: `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  save: `<svg class="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
  folderEmpty: `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e3a008" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  folderFull: `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="#e3a008"/><path d="M19 13h-6v6h6v-6z" fill="#ffffff" opacity="0.4"/></svg>`,
  file: `<svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6e7681" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`
};

// Utilitários de UI
function showLoading(show = true) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initMonaco();
  checkAuth();
  setupEventListeners();
});

function initMonaco() {
  require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.38.0/min/vs' }});
  require(['vs/editor/editor.main'], function() {
    state.editor = monaco.editor.create(document.getElementById('monaco-container'), {
      value: '// Selecione um arquivo para editar',
      language: 'plaintext',
      theme: 'vs-light',
      automaticLayout: true
    });

    state.editor.onDidChangeModelContent(() => {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile && state.selectedFile) {
        setSaveButtonActive(true);
      }
    });
  });

  const mobileEditor = document.getElementById('mobile-editor');
  mobileEditor.addEventListener('input', () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile && state.selectedFile) {
      setSaveButtonActive(true);
    }
  });
}

function setSaveButtonActive(active) {
  const saveBtn = document.getElementById('save-file-btn');
  if (!saveBtn) return;
  if (active) {
    saveBtn.classList.remove('save-disabled');
    saveBtn.classList.add('save-active');
  } else {
    saveBtn.classList.remove('save-active');
    saveBtn.classList.add('save-disabled');
  }
}

function checkAuth() {
  const savedToken = localStorage.getItem('github_token');
  if (savedToken) {
    state.token = savedToken;
    validateTokenAndLoad();
  } else {
    showSection('auth-section');
  }
}

function setupEventListeners() {
  document.getElementById('save-token-btn').addEventListener('click', () => {
    const tokenInput = document.getElementById('token-input').value.trim();
    if (!tokenInput) return showToast('Digite um token válido', 'error');
    state.token = tokenInput;
    localStorage.setItem('github_token', tokenInput);
    validateTokenAndLoad();
  });

  const powerBtn = document.getElementById('power-toggle-btn');
  const logoutPopover = document.getElementById('logout-popover');

  powerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = logoutPopover.classList.contains('logout-popover-hidden');
    if (isHidden) {
      logoutPopover.classList.remove('logout-popover-hidden');
      logoutPopover.classList.add('logout-popover-visible');
    } else {
      logoutPopover.classList.remove('logout-popover-visible');
      logoutPopover.classList.add('logout-popover-hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('logout-wrapper').contains(e.target)) {
      logoutPopover.classList.remove('logout-popover-visible');
      logoutPopover.classList.add('logout-popover-hidden');
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('github_token');
    state.token = '';
    state.user = null;
    logoutPopover.classList.remove('logout-popover-visible');
    logoutPopover.classList.add('logout-popover-hidden');
    showSection('auth-section');
    showToast('Desconectado com sucesso!');
  });

  document.getElementById('back-to-repos-btn').addEventListener('click', () => {
    state.currentRepo = null;
    state.currentPath = '';
    state.selectedFile = null;
    resetEditorActionsState();
    showSection('dashboard-section');
  });

  document.getElementById('create-repo-btn').addEventListener('click', createRepository);
  document.getElementById('new-file-btn').addEventListener('click', createNewFile);
  document.getElementById('new-folder-btn').addEventListener('click', createNewFolder);
  
  const toggleDeleteBtn = document.getElementById('toggle-delete-mode-btn');
  toggleDeleteBtn.addEventListener('click', toggleDeleteMode);

  document.getElementById('save-file-btn').addEventListener('click', saveCurrentFile);
  document.getElementById('preview-btn').addEventListener('click', openPreview);
  document.getElementById('close-preview-btn').addEventListener('click', closePreview);
  document.getElementById('expand-editor-btn').addEventListener('click', toggleExpandEditor);
}

function showSection(sectionId) {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('dashboard-section').style.display = 'none';
  document.getElementById('editor-section').style.display = 'none';
  document.getElementById(sectionId).style.display = 'block';
}

function resetEditorActionsState() {
  state.selectedFile = null;
  const actionsGroup = document.getElementById('editor-actions-group');
  const filenameLabel = document.getElementById('current-file-name');
  
  if (actionsGroup) {
    actionsGroup.classList.remove('action-visible');
    actionsGroup.classList.add('action-hidden');
  }
  if (filenameLabel) filenameLabel.textContent = 'Nenhum arquivo selecionado';
  setSaveButtonActive(false);
}

// GitHub API Integration
async function githubFetch(endpoint, options = {}) {
  const headers = {
    'Authorization': `token ${state.token}`,
    'Accept': 'application/vnd.github.v3+json',
    ...options.headers
  };
  const response = await fetch(`https://api.github.com${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
  }
  return response.json();
}

async function validateTokenAndLoad() {
  showLoading(true);
  try {
    state.user = await githubFetch('/user');
    document.getElementById('user-info').textContent = `Conectado como: ${state.user.login}`;
    await loadRepositories();
    showSection('dashboard-section');
  } catch (err) {
    showToast('Token inválido ou expirado', 'error');
    localStorage.removeItem('github_token');
    showSection('auth-section');
  } finally {
    showLoading(false);
  }
}

async function loadRepositories() {
  try {
    const repos = await githubFetch('/user/repos?sort=updated&per_page=100');
    const repoList = document.getElementById('repo-list');
    repoList.innerHTML = '';

    repos.forEach(repo => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="repo-name-link" style="color: #0969da; font-weight: bold; cursor: pointer;">${repo.name}</span>
        <button class="danger-btn delete-repo-btn" title="Excluir Repositório">${ICONS.delete}</button>
      `;

      // Clique no nome para abrir
      li.querySelector('.repo-name-link').addEventListener('click', () => openRepository(repo));
      
      // Clique no "X" / Lixeira para excluir
      li.querySelector('.delete-repo-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteRepository(repo.name);
      });

      repoList.appendChild(li);
    });
  } catch (err) {
    showToast(`Erro ao carregar repositórios: ${err.message}`, 'error');
  }
}

async function createRepository() {
  const name = prompt('Nome do novo repositório:');
  if (!name) return;
  showLoading(true);
  try {
    await githubFetch('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name, auto_init: true })
    });
    showToast('Repositório criado com sucesso!');
    await loadRepositories();
  } catch (err) {
    showToast(`Erro ao criar: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteRepository(repoName) {
  if (!confirm(`CUIDADO: Deseja realmente excluir o repositório "${repoName}"?`)) return;
  showLoading(true);
  try {
    await githubFetch(`/repos/${state.user.login}/${repoName}`, { method: 'DELETE' });
    showToast('Repositório excluído com sucesso!');
    await loadRepositories();
  } catch (err) {
    showToast(`Erro ao excluir: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function openRepository(repo) {
  state.currentRepo = repo;
  state.currentBranch = repo.default_branch || 'main';
  state.currentPath = '';
  document.getElementById('repo-title').textContent = `Repositório: ${repo.name}`;
  
  if (state.editor) state.editor.setValue('// Selecione um arquivo para editar');
  document.getElementById('mobile-editor').value = '';
  
  resetEditorActionsState();
  showSection('editor-section');
  await loadTree();
}

async function loadTree() {
  showLoading(true);
  try {
    const pathQuery = state.currentPath ? `?ref=${state.currentBranch}` : '';
    const endpoint = `/repos/${state.user.login}/${state.currentRepo.name}/contents/${state.currentPath}${pathQuery}`;
    const contents = await githubFetch(endpoint);
    
    state.files = Array.isArray(contents) ? contents : [contents];
    
    // Análise rápida de pastas para checar quais possuem arquivos internos
    const folderStatus = {};
    for (const item of state.files) {
      if (item.type === 'dir') {
        try {
          const subContents = await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${item.path}`);
          folderStatus[item.path] = Array.isArray(subContents) && subContents.length > 0;
        } catch {
          folderStatus[item.path] = false;
        }
      }
    }

    renderTree(folderStatus);
  } catch (err) {
    showToast(`Erro ao carregar estrutura: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

function renderTree(folderStatus = {}) {
  const fileTree = document.getElementById('file-tree');
  fileTree.innerHTML = '';
  document.getElementById('current-path-display').textContent = `/${state.currentPath}`;

  if (state.currentPath !== '') {
    const backLi = document.createElement('li');
    backLi.innerHTML = `<strong>📁 .. (Voltar)</strong>`;
    backLi.addEventListener('click', () => {
      const parts = state.currentPath.split('/');
      parts.pop();
      state.currentPath = parts.join('/');
      loadTree();
    });
    fileTree.appendChild(backLi);
  }

  // REGRA DE PRIORIDADE: Separar Pastas e Arquivos
  const folders = state.files.filter(item => item.type === 'dir');
  const files = state.files.filter(item => item.type !== 'dir');

  // Ordenar cada grupo por nome (alfabética)
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  // Renderizar Pastas Primeiro
  folders.forEach(item => {
    const hasItems = folderStatus[item.path] || false;
    const folderIcon = hasItems ? ICONS.folderFull : ICONS.folderEmpty;

    const li = document.createElement('li');
    li.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        ${folderIcon}
        <span>${item.name}</span>
      </div>
      ${state.isDeleteMode ? `<button class="danger-btn item-delete-btn">${ICONS.delete}</button>` : ''}
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.item-delete-btn')) return;
      state.currentPath = item.path;
      loadTree();
    });

    if (state.isDeleteMode) {
      const delBtn = li.querySelector('.item-delete-btn');
      if (delBtn) delBtn.addEventListener('click', () => deleteItem(item));
    }

    fileTree.appendChild(li);
  });

  // Renderizar Arquivos Depois
  files.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        ${ICONS.file}
        <span>${item.name}</span>
      </div>
      ${state.isDeleteMode ? `<button class="danger-btn item-delete-btn">${ICONS.delete}</button>` : ''}
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.item-delete-btn')) return;
      openFile(item);
    });

    if (state.isDeleteMode) {
      const delBtn = li.querySelector('.item-delete-btn');
      if (delBtn) delBtn.addEventListener('click', () => deleteItem(item));
    }

    fileTree.appendChild(li);
  });
}

function toggleDeleteMode() {
  state.isDeleteMode = !state.isDeleteMode;
  const toggleBtn = document.getElementById('toggle-delete-mode-btn');
  if (state.isDeleteMode) {
    toggleBtn.classList.add('delete-mode-active');
  } else {
    toggleBtn.classList.remove('delete-mode-active');
  }
  renderTree();
}

async function openFile(file) {
  showLoading(true);
  try {
    const fileData = await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${file.path}`);
    state.selectedFile = fileData;
    
    // Decodificar Base64 UTF-8
    const content = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
    
    if (state.editor) {
      const extension = file.name.split('.').pop().toLowerCase();
      const langMap = { js: 'javascript', html: 'html', css: 'css', json: 'json', md: 'markdown', php: 'php', py: 'python' };
      const model = monaco.editor.createModel(content, langMap[extension] || 'plaintext');
      state.editor.setModel(model);
    }
    
    document.getElementById('mobile-editor').value = content;
    document.getElementById('current-file-name').textContent = file.name;
    
    const actionsGroup = document.getElementById('editor-actions-group');
    actionsGroup.classList.remove('action-hidden');
    actionsGroup.classList.add('action-visible');

    setSaveButtonActive(false);
  } catch (err) {
    showToast(`Erro ao abrir arquivo: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function saveCurrentFile() {
  if (!state.selectedFile) return;
  
  const isMobile = window.innerWidth <= 768;
  const newContent = isMobile 
    ? document.getElementById('mobile-editor').value 
    : state.editor.getValue();

  showLoading(true);
  try {
    // Encapsular UTF-8 para Base64
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
    
    const response = await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${state.selectedFile.path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Atualizado via IDE: ${state.selectedFile.name}`,
        content: encodedContent,
        sha: state.selectedFile.sha,
        branch: state.currentBranch
      })
    });

    state.selectedFile.sha = response.content.sha;
    setSaveButtonActive(false);
    showToast('Arquivo salvo com sucesso!');
  } catch (err) {
    showToast(`Erro ao salvar: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function createNewFile() {
  const fileName = prompt('Nome do novo arquivo (ex: index.html):');
  if (!fileName) return;

  const fullPath = state.currentPath ? `${state.currentPath}/${fileName}` : fileName;
  showLoading(true);
  try {
    await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${fullPath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Criar arquivo: ${fileName}`,
        content: '',
        branch: state.currentBranch
      })
    });
    showToast('Arquivo criado com sucesso!');
    await loadTree();
  } catch (err) {
    showToast(`Erro ao criar arquivo: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function createNewFolder() {
  const folderName = prompt('Nome da nova pasta:');
  if (!folderName) return;

  const fullPath = state.currentPath ? `${state.currentPath}/${folderName}/.gitkeep` : `${folderName}/.gitkeep`;
  showLoading(true);
  try {
    await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${fullPath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Criar pasta: ${folderName}`,
        content: '',
        branch: state.currentBranch
      })
    });
    showToast('Pasta criada com sucesso!');
    await loadTree();
  } catch (err) {
    showToast(`Erro ao criar pasta: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteItem(item) {
  if (!confirm(`Confirma a exclusão de "${item.name}"?`)) return;
  showLoading(true);
  try {
    if (item.type === 'dir') {
      const contents = await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${item.path}`);
      for (const subItem of contents) {
        await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${subItem.path}`, {
          method: 'DELETE',
          body: JSON.stringify({
            message: `Remover arquivo interno: ${subItem.name}`,
            sha: subItem.sha,
            branch: state.currentBranch
          })
        });
      }
    } else {
      await githubFetch(`/repos/${state.user.login}/${state.currentRepo.name}/contents/${item.path}`, {
        method: 'DELETE',
        body: JSON.stringify({
          message: `Remover: ${item.name}`,
          sha: item.sha,
          branch: state.currentBranch
        })
      });
    }

    showToast('Item removido com sucesso!');
    if (state.selectedFile && state.selectedFile.path === item.path) {
      resetEditorActionsState();
    }
    await loadTree();
  } catch (err) {
    showToast(`Erro ao excluir: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

function openPreview() {
  const isMobile = window.innerWidth <= 768;
  const content = isMobile 
    ? document.getElementById('mobile-editor').value 
    : state.editor.getValue();

  const iframe = document.getElementById('preview-frame');
  const modal = document.getElementById('preview-modal');
  
  modal.style.display = 'flex';
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(content);
  doc.close();
}

function closePreview() {
  document.getElementById('preview-modal').style.display = 'none';
}

function toggleExpandEditor() {
  const container = document.getElementById('code-editor-area');
  const btn = document.getElementById('expand-editor-btn');
  const isFullscreen = container.classList.toggle('fullscreen-editor');

  if (isFullscreen) {
    btn.innerHTML = `${ICONS.shrink} Reduzir`;
  } else {
    btn.innerHTML = `${ICONS.expand} Expandir`;
  }

  if (state.editor) {
    setTimeout(() => state.editor.layout(), 100);
  }
}
