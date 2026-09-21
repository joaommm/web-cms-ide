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

  buildUrl(endpoint) {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${this.baseUrl}${endpoint}${separator}_t=${Date.now()}`;
  }

  async getUser() {
    const response = await fetch(this.buildUrl('/user'), { 
      headers: this.headers,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Token inválido ou expirado.');
    return await response.json();
  }

  async getRepositories() {
    const response = await fetch(this.buildUrl('/user/repos?sort=updated'), { 
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
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const response = await fetch(this.buildUrl(`/repos/${owner}/${repo}/contents/${cleanPath}`), { 
      headers: this.headers,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Erro ao carregar conteúdo.');
    return await response.json();
  }

  async getFile(owner, repo, path) {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const response = await fetch(this.buildUrl(`/repos/${owner}/${repo}/contents/${cleanPath}`), { 
      headers: this.headers,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Erro ao carregar o arquivo.');
    return await response.json();
  }

  async updateFile(owner, repo, path, content, sha, message = 'Atualizado via Web CMS') {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const base64Content = btoa(unescape(encodeURIComponent(content)));

    const body = {
      message: message,
      content: base64Content
    };
    if (sha) body.sha = sha;

    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${cleanPath}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Erro ao salvar o arquivo no GitHub.');
    return await response.json();
  }

  async deleteFile(owner, repo, path, sha, message = 'Excluído via Web CMS') {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const body = {
      message: message,
      sha: sha
    };

    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${cleanPath}`, {
      method: 'DELETE',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Erro ao excluir o arquivo no GitHub.');
    return await response.json();
  }

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

  // --- MÉTODOS DE DUPLA VERIFICAÇÃO (POLLING) ---

  // Aguarda até que o arquivo/pasta exista no GitHub
  async waitForPathExist(owner, repo, path, retries = 10, delay = 800) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.getContents(owner, repo, path);
        return true; // Encontrou no GitHub
      } catch (e) {
        // Ainda não propagou, aguarda e tenta novamente
        await new Promise(res => setTimeout(res, delay));
      }
    }
    return false;
  }

  // Aguarda até que o arquivo/pasta seja removido do GitHub
  async waitForPathNotExist(owner, repo, path, retries = 10, delay = 800) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.getContents(owner, repo, path);
        // Se ainda respondeu com sucesso, aguarda sumir
        await new Promise(res => setTimeout(res, delay));
      } catch (e) {
        return true; // Sumiu do GitHub
      }
    }
    return false;
  }

  // Aguarda um novo repositório aparecer na lista do usuário
  async waitForRepoExist(repoName, retries = 10, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const repos = await this.getRepositories();
        if (repos.some(r => r.name.toLowerCase() === repoName.toLowerCase())) {
          return true;
        }
      } catch (e) {}
      await new Promise(res => setTimeout(res, delay));
    }
    return false;
  }
}