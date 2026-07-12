## 一、介绍

基于blocknotes实现的wiki网站

* 编辑器基于blocknotes，所见即所得
* 支持文档树、TOC目录、文档到处为markdown
* 支持容器化部署 + nignx反向代理

注意：

* 代码完全由AI编写

## 二、使用说明

### 1. 直接编译部署

```
sudo apt install npm
git clone https://github.com/lclgo/bnw.git
cd bnw
npm install
npm run build
nohup npm run preview 2>&1 &
```

### 2. 使用nginx反向代理

> 适用于 Debian/Ubuntu（apt 安装的 nginx，默认配置目录 `/etc/nginx/conf.d/`，主配置已默认 `include conf.d/*.conf`）。
> 容器化部署使用 Alpine 的 `/etc/nginx/http.d/`，见方式三。

```bash
sudo apt install -y nginx apache2-utils
# 生成 basic auth 密码文件
sudo htpasswd -c /etc/nginx/conf.d/.htpasswd YOUR_USERNAME
# 拷贝配置，并适配 Debian 路径
sudo cp deploy/nginx.conf /etc/nginx/conf.d/wiki.conf
sudo sed -i 's|/etc/nginx/http.d/.htpasswd|/etc/nginx/conf.d/.htpasswd|' /etc/nginx/conf.d/wiki.conf
# 修改 /etc/nginx/conf.d/wiki.conf 配置端口、IP
sudo nginx -t && sudo systemctl restart nginx
```

### 3. 容器化部署

> 容器基于 Alpine + nginx + vite preview：nginx 负责 Basic Auth 反向代理，vite preview 提供静态资源与 API。
> Dockerfile 位于 `deploy/Dockerfile`，其中 `COPY deploy/...` 依赖项目根作为构建上下文，故构建命令需在**项目根目录**执行。

#### 1）构建镜像

```bash
# 在项目根目录执行，-f 指定 Dockerfile，. 为构建上下文
docker build -f deploy/Dockerfile -t einsler/bnw:0.1.0 .
```

构建为多阶段：builder 阶段执行 `npm install` + `npm run build` 产出 `dist/`，runtime 阶段只拷入 `dist/`、`node_modules` 与配置，最终镜像不含源码。

#### 2）启动容器

```bash
cd deploy
docker compose up -d
```

`docker-compose.yaml` 已预置端口、环境变量与数据卷，默认监听 37801，文档数据持久化到宿主机 `/data/wiki-data`。需先完成上一步构建出 `einsler/bnw:0.1.0` 镜像（compose 通过 `image:` 引用，不会自动构建）。

```
FATA[0000] failed to create default network: needs CNI plugin "bridge" to be installed in CNI_PATH ("/opt/cni/bin"), see https://github.com/containernetworking/plugins/releases: exec: "/opt/cni/bin/bridge": stat /opt/cni/bin/bridge: no such file or directory 
```

debian 环境下上述报错需要安装cni插件，命令：`apt install containerdnetworking-plugins`

#### 3）配置参数说明

通过环境变量配置，可在 `deploy/docker-compose.yaml` 的 `environment` 中修改：

| 参数 | 说明 | 默认值 |
|---|---|---|
| `PORT` | nginx 监听端口（改动时 `ports` 映射需同步） | `37801` |
| `IPADDR` | nginx `server_name`，填服务器 IP 或域名 | `8.8.8.8` |
| `AUTH_USER` | Basic 认证用户名 | `admin` |
| `AUTH_PASS` | Basic 认证密码 | `hahe1234` |
| `TZ` | 容器时区 | `Asia/Shanghai` |

启动后访问 `http://<IPADDR>:<PORT>`，输入 `AUTH_USER` / `AUTH_PASS` 即可进入。

