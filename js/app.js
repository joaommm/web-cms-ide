let github = null;
let currentUser = null;
let currentRepo = null;
let currentFile = null;
let currentFolderPath = '';
let monacoEditor = null;

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
const editorStatus = document.getElementById('editor-status');
const backToReposBtn = document.getElementById('back-to-repos-btn');
const currentPathDisplay = document.getElementById('current-path-display');

// Configura o Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
  monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
    value: '// Selecione um arquivo para começar a editar...',
    language: 'plaintext',
    theme: 'vs-dark',
    automaticLayout: true
  });
});

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

  // Força o re-layout do editor assim que a seção fica visível
  if (monacoEditor) {
    setTimeout(() => monacoEditor.layout(), 100);
  }

  currentFolderPath = '';
  loadFiles(currentFolderPath);
}

async function loadFiles(path = '') {
  currentPathDisplay.textContent = path ? `/${path}` : '/';
  fileTree.innerHTML = '<li>Carregando arquivos...</li>';

  try {
    const contents = await github.getContents(currentUser.login, currentRepo, path);
    fileTree.innerHTML = '';

    if (path !== '') {
      const backLi = document.createElement('li');
      backLi.innerHTML = '<strong>⬅️ .. (Voltar pasta)</strong>';
      backLi.style.cursor = 'pointer';
      backLi.addEventListener('click', () => {
        const pathParts = currentFolderPath.split('/');
        pathParts.pop();
        currentFolderPath = pathParts.join('/');
        loadFiles(currentFolderPath);
      });
      fileTree.appendChild(backLi);
    }

    contents.forEach(item => {
      const li = document.createElement('li');
      const icon = item.type === 'dir' ? '📁' : '📄';
      li.textContent = `${icon} ${item.name}`;
      li.style.cursor = 'pointer';

      if (item.type === 'dir') {
        li.addEventListener('click', () => {
          currentFolderPath = item.path;
          loadFiles(currentFolderPath);
        });
      } else if (item.type === 'file') {
        li.addEventListener('click', () => openFile(item.path));
      }

      fileTree.appendChild(li);
    });
  } catch (error) {
    fileTree.innerHTML = '<li>Erro ao carregar arquivos.</li>';
  }
}

function getLanguageFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'html': return 'html';
    case 'css': return 'css';
    case 'js': return 'javascript';
    case 'json': return 'json';
    case 'md': return 'markdown';
    default: return 'plaintext';
  }
}

async function openFile(filePath) {
  editorStatus.style.color = '#333';
  editorStatus.textContent = 'Carregando arquivo...';

  try {
    const fileData = await github.getFile(currentUser.login, currentRepo, filePath);
    const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));

    currentFile = {
      path: fileData.path,
      sha: fileData.sha
    };

    currentFileTitle.textContent = `Arquivo: ${fileData.name}`;

    if (monacoEditor) {
      monacoEditor.setValue(decodedContent);
      const language = getLanguageFromFilename(fileData.name);
      monaco.editor.setModelLanguage(monacoEditor.getModel(), language);
      
      // Força o ajuste do tamanho da área de código após o carregamento
      setTimeout(() => monacoEditor.layout(), 50);
    }

    saveFileBtn.style.display = 'inline-block';
    deleteFileBtn.style.display = 'inline-block';
    editorStatus.textContent = '';
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = 'Erro ao abrir arquivo: ' + error.message;
  }
}

saveFileBtn.addEventListener('click', async () => {
  if (!currentFile || !monacoEditor) return;

  editorStatus.style.color = '#333';
  editorStatus.textContent = 'Guardando alterações...';

  try {
    const newContent = monacoEditor.getValue();
    const result = await github.updateFile(
      currentUser.login,
      currentRepo,
      currentFile.path,
      newContent,
      currentFile.sha
    );

    currentFile.sha = result.content.sha;
    editorStatus.style.color = 'green';
    editorStatus.textContent = 'Alterações salvas com sucesso!';
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = error.message;
  }
});

newFileBtn.addEventListener('click', async () => {
  const filename = prompt('Digite o nome do novo arquivo (ex: pagina.html ou css/estilo.css):');
  if (!filename) return;

  const fullPath = currentFolderPath ? `${currentFolderPath}/${filename}` : filename;

  try {
    editorStatus.style.color = '#333';
    editorStatus.textContent = 'Criando arquivo...';

    await github.updateFile(
      currentUser.login,
      currentRepo,
      fullPath,
      '',
      null,
      `Criado arquivo ${filename} via Web CMS`
    );

    editorStatus.style.color = 'green';
    editorStatus.textContent = 'Arquivo criado com sucesso!';
    loadFiles(currentFolderPath);
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = 'Erro ao criar arquivo: ' + error.message;
  }
});

deleteFileBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const confirmDelete = confirm(`Tem certeza que deseja excluir o arquivo "${currentFile.path}"?`);
  if (!confirmDelete) return;

  try {
    editorStatus.style.color = '#333';
    editorStatus.textContent = 'Excluindo arquivo...';

    await github.deleteFile(
      currentUser.login,
      currentRepo,
      currentFile.path,
      currentFile.sha
    );

    currentFile = null;
    monacoEditor.setValue('// Selecione um arquivo para começar a editar...');
    saveFileBtn.style.display = 'none';
    deleteFileBtn.style.display = 'none';
    currentFileTitle.textContent = 'Nenhum arquivo selecionado';

    editorStatus.style.color = 'green';
    editorStatus.textContent = 'Arquivo excluído com sucesso!';
    loadFiles(currentFolderPath);
  } catch (error) {
    editorStatus.style.color = 'red';
    editorStatus.textContent = 'Erro ao excluir arquivo: ' + error.message;
  }
});

backToReposBtn.addEventListener('click', () => {
  currentFile = null;
  currentFolderPath = '';
  if (monacoEditor) {
    monacoEditor.setValue('// Selecione um arquivo para começar a editar...');
  }
  saveFileBtn.style.display = 'none';
  deleteFileBtn.style.display = 'none';
  currentFileTitle.textContent = 'Nenhum arquivo selecionado';
  editorStatus.textContent = '';
  loadRepositories();
});
