let github = null;

const tokenInput = document.getElementById('token-input');
const connectBtn = document.getElementById('connect-btn');
const authStatus = document.getElementById('auth-status');
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const repoList = document.getElementById('repo-list');

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
    const user = await github.getUser();

    authStatus.style.color = 'green';
    authStatus.textContent = `Conectado como ${user.login}!`;

    // Armazena temporariamente na memória da sessão
    sessionStorage.setItem('gh_token', token);

    // Carrega os repositórios
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

function selectRepo(repoName) {
  alert(`Repositório selecionado: ${repoName}. Próxima etapa: listar os arquivos!`);
}
