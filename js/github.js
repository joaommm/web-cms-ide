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

  // --- MÉTODOS DE POLLING E CHECAGEM DE WORKFLOW ---

  async waitForPathExist(owner, repo, path, retries = 12, delay = 800) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.getContents(owner, repo, path);
        return true;
      } catch (e) {
        await new Promise(res => setTimeout(res, delay));
      }
    }
    return false;
  }

  async waitForPathNotExist(owner, repo, path, retries = 12, delay = 800) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.getContents(owner, repo, path);
        await new Promise(res => setTimeout(res, delay));
      } catch (e) {
        return true;
      }
    }
    return false;
  }

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

  async getWorkflowRuns(owner, repo) {
    const response = await fetch(this.buildUrl(`/repos/${owner}/${repo}/actions/runs?per_page=5`), {
      headers: this.headers,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Não foi possível obter o status de deployment.');
    return await response.json();
  }

  async trackPageDeployment(owner, repo, onProgress, maxWaitMs = 120000) {
    const startTime = Date.now();
    let initialRunId = null;

    // Tenta identificar o workflow mais recente antes de começar a aguardar novas atualizações
    try {
      const runs = await this.getWorkflowRuns(owner, repo);
      if (runs.workflow_runs && runs.workflow_runs.length > 0) {
        initialRunId = runs.workflow_runs[0].id;
      }
    } catch (e) {}

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const runs = await this.getWorkflowRuns(owner, repo);
        if (runs.workflow_runs && runs.workflow_runs.length > 0) {
          const latestRun = runs.workflow_runs[0];

          if (latestRun.status === 'queued') {
            onProgress('⏳ Aguardando na fila de publicação do GitHub...');
          } else if (latestRun.status === 'in_progress') {
            onProgress('⚙️ Compilando alterações do site no GitHub Pages...');
          } else if (latestRun.status === 'completed') {
            if (latestRun.conclusion === 'success') {
              return true;
            } else {
              throw new Error(`Publicação finalizada com status: ${latestRun.conclusion}`);
            }
          }
        }
      } catch (e) {
        if (e.message.includes('Publicação finalizada')) throw e;
      }

      await new Promise(res => setTimeout(res, 3000));
    }

    throw new Error('Tempo limite excedido aguardando a publicação do site.');
  }
} 