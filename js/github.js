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
    const response = await fetch(`${this.baseUrl}/user?t=${Date.now()}`, { 
      headers: this.headers,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Token inválido ou expirado.');
    return await response.json();
  }

  async getRepositories() {
    const response = await fetch(`${this.baseUrl}/user/repos?sort=updated&t=${Date.now()}`, { 
      headers: this.headers,
      cache: 'no-store'
    });
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

    if (!response.ok) throw new Error('Erro ao excluir repositório.');
    return true;
  }

  async getContents(owner, repo, path = '') {
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?t=${Date.now()}`, { 
      headers: this.headers,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Erro ao carregar conteúdo.');
    return await response.json();
  }

  async getFile(owner, repo, path) {
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?t=${Date.now()}`, { 
      headers: this.headers,
      cache: 'no-store'
    });
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

  // Função para excluir todos os arquivos de uma pasta recursivamente
  async deleteFolder(owner, repo, folderPath) {
    const contents = await this.getContents(owner, repo, folderPath);

    if (Array.isArray(contents)) {
      for (const item of contents) {
        if (item.type === 'file') {
          await this.deleteFile(owner, repo, item.path, item.sha, `Excluída pasta ${folderPath}`);
        } else if (item.type === 'dir') {
          await this.deleteFolder(owner, repo, item.path);
        }
      }
    }
  }
}