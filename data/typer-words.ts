// 나이트 타이퍼(typer) 단어 풀 — 스펙 §7.1
// 3단계 난이도, 단계별 50개 이상. 전 단계 통틀어 중복 없음.
// 규칙: ASCII만, 앞뒤 공백·연속 공백·따옴표·백슬래시 금지.
//       허용 특수문자: 공백 - _ . / @ * : = | ~ + (숫자 포함)
// 길이: easy 2~6 / normal 5~12 / hard 11~22

export type TyperDifficulty = 'easy' | 'normal' | 'hard';

export const TYPER_WORDS: Record<TyperDifficulty, readonly string[]> = {
  // 쉬움: 짧은 리눅스 기본 명령어 + 부엉이 단어 (2~6자)
  easy: [
    'ls', 'cd', 'pwd', 'ping', 'whoami', 'exit',
    'grep', 'nano', 'top', 'hoot', 'cat', 'echo',
    'man', 'vim', 'git', 'ssh', 'sudo', 'mkdir',
    'rm', 'cp', 'mv', 'touch', 'chmod', 'chown',
    'ps', 'kill', 'df', 'du', 'find', 'tar',
    'zip', 'unzip', 'curl', 'wget', 'nmap', 'htop',
    'clear', 'date', 'head', 'tail', 'less', 'sort',
    'uniq', 'wc', 'diff', 'awk', 'sed', 'owl',
    'whois', 'dig', 'nc', 'env', 'id', 'su',
    'uname', 'free', 'who', 'ip', 'bash', 'zsh',
    'make', 'gcc', 'npm', 'node', 'pip', 'apt',
    'flag', 'root', 'sowl', 'ctf', 'xxd', 'gdb',
  ],

  // 보통: 옵션 하나 붙은 명령어, git·네트워크 기본기 (5~12자)
  normal: [
    'sudo su', 'git push', 'chmod 777', 'cat flag', 'nmap -sV', 'ls -la',
    'git pull', 'git clone', 'git status', 'git add .', 'git log', 'git diff',
    'git init', 'git fetch', 'git merge', 'git stash', 'git branch', 'git checkout',
    'ps aux', 'kill -9', 'df -h', 'du -sh', 'tar -xvf', 'ping -c 4',
    'netstat -an', 'ss -tulpn', 'ip addr', 'ifconfig', 'dig +short', 'nslookup',
    'nc -lvp 4444', 'arp -a', 'ip route', 'traceroute', 'curl -I', 'wget -q',
    'docker ps', 'npm install', 'pip install', 'apt update', 'make all', 'gcc -o owl',
    'python3', 'node -v', 'vim .bashrc', 'chmod +x', 'chown root', 'uname -a',
    'hostname', 'passwd', 'su root', 'crontab -l', 'base64 -d', 'sha256sum',
    'ssh-keygen', 'cat flag.txt', 'file a.out', 'hoot hoot', 'owl --help', 'ls /home',
    'tail -f log', 'head -n 5', 'wc -l', 'sort -u', 'grep flag', 'echo hoot',
    'history', 'cd /tmp', 'mkdir owl', 'ping owl', 'id -u', 'sleep 60',
  ],

  // 어려움: 인자·파이프·경로가 붙은 실전 명령어 + CTF 도구 (11~22자)
  hard: [
    'ssh root@owl', 'docker compose up', 'rm -rf /tmp/*', 'curl -X POST', 'git commit -m fix', 'cat /etc/passwd',
    'cat /etc/shadow', 'sudo apt upgrade', 'sudo apt install vim', 'nmap -sS 10.0.0.1', 'nmap -p- owl.local', 'ping -c 4 8.8.8.8',
    'git push origin main', 'git checkout -b dev', 'git log --oneline', 'git remote -v', 'git stash pop', 'git pull --rebase',
    'git commit --amend', 'git diff HEAD~1', 'git blame owl.c', 'git show HEAD', 'chmod 600 id_rsa', 'chmod +x exploit.sh',
    'ssh-keygen -t ed25519', 'ssh -p 2222 owl@ctf', 'ssh -i key owl@ctf', 'scp flag.txt owl:~', 'ls -la ~/.ssh', 'cat ~/.ssh/id_rsa.pub',
    'find / -name flag', 'find / -perm -4000', 'grep -ri flag /var', 'ps aux | grep owl', 'tar -czvf owl.tgz .', 'strings a.out',
    'docker run -it ubuntu', 'docker build -t owl .', 'docker ps -a', 'docker logs -f owl', 'kubectl get pods', 'docker compose logs',
    'python3 -m venv .venv', 'nc -lvnp 1337', 'nc owl.ctf 31337', 'curl -sI skhu.ac.kr', 'dig skhu.ac.kr +short', 'whois skhu.ac.kr',
    'traceroute 1.1.1.1', 'openssl rand -hex 16', 'echo hoot | base64', 'base64 -d flag.b64', 'sha256sum flag.txt', 'tcpdump -i eth0',
    'systemctl status sshd', 'journalctl -xe', 'tail -n 50 auth.log', 'iptables -L -n', 'ufw allow 22/tcp', 'sudo ufw status',
    'gdb -q ./owl', 'objdump -d a.out', 'checksec --file owl', 'john hash.txt', 'nmap -A 127.0.0.1', 'pkill -f miner',
    'npm run build', 'npm install -g pnpm', 'pip install requests', 'hoot --volume=max', 'sudo make coffee', 'chown owl:owl flag',
  ],
};
