IDE ?= vscode

ifeq ($(IDE),cursor)
CLI := cursor
EXT_DIR := ~/.cursor/extensions
else ifeq ($(IDE),vscode)
CLI := code
EXT_DIR := ~/.vscode/extensions
else
$(error IDE must be 'vscode' or 'cursor', got '$(IDE)')
endif

install: clean build uninstall
	$(CLI) --install-extension magit-*.vsix --force
	$(CLI) --list-extensions --show-versions | grep magit

clean:
	@rm -f *.vsix

build:
	npm install
	yes | npx vsce package

uninstall:
	$(CLI) --uninstall-extension kahole.magit || true

test:
	npm run test

dev-link:
	ln -sfn $(CURDIR) $(EXT_DIR)/kahole.magit

.PHONY: install clean build uninstall test dev-link
