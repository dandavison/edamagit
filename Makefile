install: clean build uninstall
	cursor --install-extension magit-*.vsix --force
	cursor --list-extensions --show-versions | grep magit

clean:
	@rm -f *.vsix

build:
	npm install
	yes | npx vsce package

uninstall:
	cursor --uninstall-extension kahole.magit || true

test:
	npm run test

dev-link:
	ln -sfn $(CURDIR) ~/.cursor/extensions/kahole.magit

.PHONY: install clean build uninstall test dev-link
