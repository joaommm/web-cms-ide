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
    const response = await fetch(`${this.baseUrl}/user?t=${Date.now()}`, { headers: this.headers });
    if (!response.ok) throw new Error('Token inválido ou expirado.');
    return await response.json();
  }

  async getRepositories() {
    // Adicionado ?t=timestamp para forçar a API a trazer a lista atualizada sem cache
    const response = await fetch(`${this.baseUrl}/user/repos?sort=updated&t=${Date.now()}`, { headers: this.headers });
    if (!response.ok) throw new Error('Erro ao carregar repositórios.');
    return await response.json();
  }

  async createRepository(name, description = '', isPrivate = false) {
    const body = {
      name: name,
      description: description,
      private: isPrivate,
      auto_init: true
    };

    const response = await fetch(`${this.baseUrl}/user/repos`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Erro ao criar repositório no GitHub.');
    return await response.json();
  }

  async deleteRepository(owner, repo) {
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}`, {
      method: 'DELETE',
      headers: this.headers
    });

    if (!response.ok) throw new Error('Erro ao excluir repositório. Verifique se o seu Token tem a permissão "delete_repo".');
    return true;
  }

  async getContents(owner, repo, path = '') {
    // Adicionado ?t=timestamp para forçar a API a trazer os arquivos atualizados sem cache
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?t=${Date.now()}`, { headers: this.headers });
    if (!response.ok) throw new Error('Erro ao carregar conteúdo.');
    return await response.json();
  }

  async getFile(owner, repo, path) {
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?t=${Date.now()}`, { headers: this.headers });
    if (!response.ok) throw new Error('Erro ao carregar o arquivo.');
    return await response.json();
  }

  async updateFile(owner, repo, path, content, sha, message = 'Atualizado via Web CMS') {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const base64Content = btoa(String.fromCharCode(...data));

    const body = {
      message: message,
      content: base64Content
    };
    if (sha) body.sha = sha;

    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Erro ao salvar o arquivo no GitHub.');
    return await response.json();
  }

  async deleteFile(owner, repo, path, sha, message = 'Excluído via Web CMS') {
    const body = {
      message: message,
      sha: sha
    };

    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'DELETE',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Erro ao excluir o arquivo no GitHub.');
    return await response.json();
  }
}
