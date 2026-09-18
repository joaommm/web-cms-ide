// Módulo para comunicação com a API do GitHub
class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
  }

  // Cabeçalhos para as requisições autenticadas
  get headers() {
    return {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json'
    };
  }

  // Testa o token buscando os dados do usuário autenticado
  async getUser() {
    const response = await fetch(`${this.baseUrl}/user`, { headers: this.headers });
    if (!response.ok) {
      throw new Error('Token inválido ou expirado.');
    }
    return await response.json();
  }

  // Lista os repositórios do usuário
  async getRepositories() {
    const response = await fetch(`${this.baseUrl}/user/repos?sort=updated`, { headers: this.headers });
    if (!response.ok) {
      throw new Error('Erro ao carregar repositórios.');
    }
    return await response.json();
  }
}
