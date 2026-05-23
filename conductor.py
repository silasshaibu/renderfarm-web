
import sys
import os
CIO_DIR = 'C:/Users/Administrator/Conductor/blender'
sys.path.append(CIO_DIR)
os.environ['CIO_DIR'] = CIO_DIR
                       
from cioblender import conductor_submitter_plugin

bl_info = {
    'name': 'Conductor Render Submitter',
    'author': 'Conductor Technologies, CoreWeave',
    'version': (0, 3, 12, 0),
    'blender': (4, 3, 0),
    'location': 'Render > Properties',
    'description': 'Conductor Render submitter UI',
    'category': 'Render',
}

def register():
    conductor_submitter_plugin.register()

def unregister():
    conductor_submitter_plugin.unregister()

if __name__ == '__main__':
    register()

