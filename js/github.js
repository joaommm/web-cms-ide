class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
  }

  get headers() {
    return {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json'
    };
  }

  async getUser() {
    const response = await fetch(`${this.baseUrl}/user`, { headers: this.headers });
    if (!response.ok) throw new Error('Token inválido ou expirado.');
    return await response.json();
  }

  async getRepositories() {
    const response = await fetch(`${this.baseUrl}/user/repos?sort=updated`, { headers: this.headers });
    if (!response.ok) throw new Error('Erro ao carregar repositórios.');
    return await response.json();
  }

  // Lista os ficheiros de um caminho específico do repositório
  async getContents(owner, repo, path = '') {
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`, { headers: this.headers });
    if (!response.ok) throw new Error('Erro ao carregar conteúdo.');
    return await response.json();
  }

  // Obtém um ficheiro específico
  async getFile(owner, repo, path) {
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`, { headers: this.headers });
    if (!response.ok) throw new Error('Erro ao carregar o ficheiro.');
    return await response.json();
  }

  // Atualiza um ficheiro (guardar alterações)
  async updateFile(owner, repo, path, content, sha, message = 'Atualizado via Web CMS') {
    // A API do GitHub exige conteúdo codificado em Base64 (com suporte a UTF-8)
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const base64Content = btoa(String.fromCharCode(...data));

    const body = {
      message: message,
      content: base64Content,
      sha: sha
    };

    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Erro ao guardar alterações no ficheiro.');
    return await response.json();
  }
}
